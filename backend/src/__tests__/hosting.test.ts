/**
 * EVAL: the circle is never left without a host, and a dropped phone is
 * present, not absent.
 *
 * Succession uses the shared `nextHost` rule — longest-present connected
 * participant — so these evals also pin the server to the same answer every
 * phone computes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collect,
  createRoom,
  joinRoom,
  sleep,
  startRig,
  waitFor,
  type TestRig,
} from "./helpers.js";

const GRACE_MS = 150;

let rig: TestRig;
beforeEach(async () => {
  rig = await startRig({ disconnectGraceMs: GRACE_MS });
});
afterEach(async () => {
  await rig.close();
});

describe("explicit leave", () => {
  it("passes the circle to the longest-present, immediately", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host");
    const first = rig.connect();
    const { youId: firstId } = await joinRoom(first, room.code, "First");
    await sleep(30); // measurable join-order gap
    const second = rig.connect();
    await joinRoom(second, room.code, "Second");

    const changed = waitFor(second, "host:changed");
    host.emit("room:leave");
    const handOver = await changed;
    expect(handOver.participantId).toBe(firstId);
    expect(handOver.reason).toBe("left");
  });

  it("ends the room when the last person walks out", async () => {
    const host = rig.connect();
    await createRoom(host, "Alone");
    host.emit("room:leave");
    await sleep(100);
    // Nothing to assert on the wire — the eval is that nothing crashes and a
    // second leave is harmless.
    host.emit("room:leave");
    await sleep(50);
  });
});

describe("disconnect", () => {
  it("marks them present-but-disconnected first — a locked screen is not leaving", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host");
    const guest = rig.connect();
    const { youId } = await joinRoom(guest, room.code, "Guest");

    const updated = waitFor(host, "participant:updated");
    guest.disconnect();
    const seen = await updated;
    expect(seen.id).toBe(youId);
    expect(seen.connected).toBe(false);
  });

  it("removes them only after the grace runs out", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host");
    const guest = rig.connect();
    const { youId } = await joinRoom(guest, room.code, "Guest");

    const departures = collect(host, "participant:left");
    guest.disconnect();
    await sleep(GRACE_MS / 2);
    expect(departures.all()).toHaveLength(0); // still holding their seat
    await sleep(GRACE_MS * 2);
    expect(departures.all().map((d) => d.participantId)).toEqual([youId]);
  });

  it("hands the circle on when a vanished host never comes back", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host");
    const heirSocket = rig.connect();
    const { youId: heirId } = await joinRoom(heirSocket, room.code, "Heir");

    const changed = waitFor(heirSocket, "host:changed", 4000);
    host.disconnect();
    const handOver = await changed;
    expect(handOver.participantId).toBe(heirId);
    expect(handOver.reason).toBe("disconnected");
  });

  it("skips a candidate who is themselves offline", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host");
    const early = rig.connect();
    await joinRoom(early, room.code, "Early");
    await sleep(30);
    const late = rig.connect();
    const { youId: lateId } = await joinRoom(late, room.code, "Late");

    // The longest-present candidate drops off the network...
    early.disconnect();
    await sleep(40);
    // ...and then the host walks out. The circle must go to someone reachable.
    const changed = waitFor(late, "host:changed");
    host.emit("room:leave");
    expect((await changed).participantId).toBe(lateId);
  });
});
