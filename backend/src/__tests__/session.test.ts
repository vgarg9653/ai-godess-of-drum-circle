/**
 * EVAL: the session — who controls it, how it begins, and what the close-out
 * is allowed to say.
 *
 * The last describe is the one that guards the product's soul: the summary is
 * checked structurally, so a field capable of ranking people cannot be added
 * without a test failing.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getInstrument, type SessionSummary } from "@godc/shared";
import {
  collect,
  createRoom,
  joinRoom,
  selectInstrument,
  sleep,
  startRig,
  waitFor,
  type TestRig,
} from "./helpers.js";

let rig: TestRig;
beforeEach(async () => {
  rig = await startRig();
});
afterEach(async () => {
  await rig.close();
});

describe("instrument allocation", () => {
  it("keeps a filling room balanced across families", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host");
    const chosen: string[] = [await selectInstrument(host)];
    for (let i = 0; i < 7; i++) {
      const s = rig.connect();
      await joinRoom(s, room.code, `P${i}`);
      chosen.push(await selectInstrument(s));
    }
    const families = new Set(
      chosen.map((id) => getInstrument(id)?.family ?? "?"),
    );
    // Eight people must span the room's range, not pile onto one family.
    expect(families.size).toBeGreaterThanOrEqual(3);
  });

  it("honours an explicit choice and tells the room", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host");
    const guest = rig.connect();
    await joinRoom(guest, room.code, "G");

    const updated = waitFor(host, "participant:updated");
    const id = await selectInstrument(guest, "sitar");
    expect(id).toBe("sitar");
    expect((await updated).instrumentId).toBe("sitar");
  });
});

describe("transport", () => {
  it("is the host's alone", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host");
    const guest = rig.connect();
    await joinRoom(guest, room.code, "G");

    const refusal = waitFor(guest, "error");
    guest.emit("transport:update", { bpm: 100 });
    expect((await refusal).code).toBe("NOT_HOST");
  });

  it("clamps and broadcasts, and never moves the shared origin", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host");
    const origin = room.transport.startedAt;

    const first = waitFor(host, "transport:state");
    host.emit("transport:update", { bpm: 500, moodId: "night" });
    const t = await first;
    expect(t.bpm).toBe(120); // clamped to BPM_MAX
    expect(t.moodId).toBe("night");
    expect(t.startedAt).toBe(origin); // tempo changes never restart the cycle
    expect(t.revision).toBeGreaterThan(room.transport.revision);
  });
});

describe("beginning", () => {
  it("re-origins the clock on a whole second in the near future", async () => {
    const host = rig.connect();
    await createRoom(host, "Host");
    const began = waitFor(host, "session:began");
    host.emit("session:begin");
    const t = await began;
    expect(t.startedAt % 1000).toBe(0);
    expect(t.startedAt).toBeGreaterThan(Date.now());
    expect(t.startedAt - Date.now()).toBeLessThan(4000);
  });

  it("only the host can begin, and only once", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host");
    const guest = rig.connect();
    await joinRoom(guest, room.code, "G");

    const refusal = waitFor(guest, "error");
    guest.emit("session:begin");
    expect((await refusal).code).toBe("NOT_HOST");

    const first = waitFor(host, "session:began");
    host.emit("session:begin");
    await first;
    const again = collect(host, "session:began");
    host.emit("session:begin");
    await sleep(150);
    expect(again.all()).toHaveLength(0);
  });
});

describe("the close-out", () => {
  async function endedSummaries(): Promise<{
    hostSummary: SessionSummary;
    guestSummary: SessionSummary;
  }> {
    const host = rig.connect();
    const { room } = await createRoom(host, "Asha");
    await selectInstrument(host, "tabla");
    const guest = rig.connect();
    await joinRoom(guest, room.code, "Ravi");
    await selectInstrument(guest, "dhol");

    host.emit("session:begin");
    await waitFor(host, "session:began");

    host.emit("phrase:update", {
      instrumentId: "tabla",
      revision: 1,
      onsets: [
        { step: 0, velocity: 0.9, stroke: "outer" },
        { step: 8, velocity: 0.8, stroke: "center" },
      ],
    });
    guest.emit("phrase:update", {
      instrumentId: "dhol",
      revision: 1,
      onsets: [{ step: 0, velocity: 1, stroke: "outer" }],
    });
    await sleep(200);

    const hostEnd = waitFor(host, "session:ended");
    const guestEnd = waitFor(guest, "session:ended");
    host.emit("session:end");
    return { hostSummary: await hostEnd, guestSummary: await guestEnd };
  }

  it("is personal: each phone gets its own figures, never anybody else's", async () => {
    const { hostSummary, guestSummary } = await endedSummaries();
    expect(hostSummary.you.instrumentId).toBe("tabla");
    expect(hostSummary.you.onsetsPlayed).toBe(2);
    expect(guestSummary.you.instrumentId).toBe("dhol");
    expect(guestSummary.you.onsetsPlayed).toBe(1);
    // The shared part is identical for everyone.
    expect(hostSummary.room).toEqual(guestSummary.room);
  });

  it("carries nothing capable of ranking people — checked by shape", async () => {
    const { hostSummary } = await endedSummaries();
    // These keys are the whole contract. A per-person count cannot exist here.
    expect(Object.keys(hostSummary.room).sort()).toEqual([
      "cyclesCompleted",
      "instrumentsUsed",
      "roster",
      "totalOnsets",
      "weave",
    ]);
    for (const entry of hostSummary.room.roster) {
      expect(Object.keys(entry).sort()).toEqual(["instrumentId", "name"]);
    }
    // The weave is aggregated by family, not by person.
    expect(Object.keys(hostSummary.room.weave).sort()).toEqual([
      "bass",
      "bed",
      "rhythm",
      "top",
    ]);
  });

  it("adds the weave up correctly from what was actually playing", async () => {
    const { hostSummary } = await endedSummaries();
    const { weave, totalOnsets } = hostSummary.room;
    expect(totalOnsets).toBe(3);
    // tabla is Beat (rhythm), dhol is Deep (bass).
    expect(weave.rhythm[0]).toBe(1);
    expect(weave.rhythm[8]).toBe(1);
    expect(weave.bass[0]).toBe(1);
    const sum = Object.values(weave).flat().reduce((a, b) => a + b, 0);
    expect(sum).toBe(totalOnsets);
  });
});
