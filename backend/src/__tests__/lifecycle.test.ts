/**
 * EVAL: entry.
 *
 * The brief: create a room and share it as a single link; join with a name
 * only; minimum steps between opening the link and producing sound. These
 * evals hold the server to that.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "@godc/shared";
import {
  createRoom,
  joinRoom,
  ping,
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

describe("creating a circle", () => {
  it("returns a joinable room with a 4-character code and the host seated", async () => {
    const host = rig.connect();
    const { room, youId, serverTime } = await createRoom(host, "Asha");
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(room.phase).toBe("gathering");
    expect(room.mode).toBe("jam");
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0].isHost).toBe(true);
    expect(room.participants[0].name).toBe("Asha");
    expect(youId).toBe(room.participants[0].id);
    expect(Math.abs(serverTime - Date.now())).toBeLessThan(2000);
  });

  it("refuses a stale protocol so old tabs fail loudly, not weirdly", async () => {
    const socket = rig.connect();
    const result = await new Promise<{ ok: boolean }>((resolve) => {
      socket.emit(
        "room:create",
        {
          hostName: "Old",
          expectedSize: "small",
          mode: "jam",
          protocolVersion: PROTOCOL_VERSION - 1,
        },
        resolve,
      );
    });
    expect(result.ok).toBe(false);
  });

  it("requires a name — the only thing the brief asks for", async () => {
    const socket = rig.connect();
    await expect(createRoom(socket, "   ")).rejects.toThrow("NAME_REQUIRED");
  });
});

describe("joining", () => {
  it("needs a name and a code, and nothing else", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Asha");

    const guest = rig.connect();
    const joined = await joinRoom(guest, room.code.toLowerCase(), "Ravi");
    expect(joined.room.participants).toHaveLength(2);
    expect(joined.room.participants[1].isHost).toBe(false);
  });

  it("tells the rest of the room someone arrived", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Asha");
    const arrival = waitFor(host, "participant:joined");
    await joinRoom(rig.connect(), room.code, "Ravi");
    expect((await arrival).name).toBe("Ravi");
  });

  it("turns away a code that means nothing", async () => {
    await expect(joinRoom(rig.connect(), "XXXX", "Lost")).rejects.toThrow(
      "ROOM_NOT_FOUND",
    );
  });

  it("hands a late joiner the phrases already playing, so their screen is alive", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Asha");
    host.emit("phrase:update", {
      instrumentId: "tabla",
      revision: 1,
      onsets: [{ step: 0, velocity: 0.9, stroke: "outer" }],
    });
    await new Promise((r) => setTimeout(r, 150));

    const late = await joinRoom(rig.connect(), room.code, "Late");
    const phrases = Object.values(late.room.phrases);
    expect(phrases).toHaveLength(1);
    expect(phrases[0].onsets).toHaveLength(1);
  });
});

describe("the shared clock", () => {
  it("echoes t0 untouched and answers with an honest timestamp", async () => {
    const socket = rig.connect();
    await createRoom(socket, "Asha");
    const t0 = Date.now();
    const pong = await ping(socket);
    expect(Math.abs(pong.serverTime - Date.now())).toBeLessThan(1500);
    expect(pong.t0).toBeGreaterThanOrEqual(t0 - 5);
  });

  it("answers fast — every ms here becomes timing error on a phone", async () => {
    const socket = rig.connect();
    await createRoom(socket, "Asha");
    await ping(socket); // warm
    const started = performance.now();
    for (let i = 0; i < 5; i++) await ping(socket);
    const per = (performance.now() - started) / 5;
    expect(per).toBeLessThan(50);
  });
});

describe("leaving", () => {
  it("removes the leaver and tells everyone", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Asha");
    const guest = rig.connect();
    const { youId } = await joinRoom(guest, room.code, "Ravi");

    const gone = waitFor(host, "participant:left");
    guest.emit("room:leave");
    expect((await gone).participantId).toBe(youId);
  });
});
