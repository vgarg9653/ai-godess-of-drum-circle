/**
 * EVAL: phrases on the wire.
 *
 * The server's job here is trust management: fan a phrase out to everyone but
 * its author, refuse anything that would break the room's density guarantee,
 * and never let a delayed packet resurrect a phrase the player replaced.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maxOnsets, type Onset, type Phrase } from "@godc/shared";
import {
  collect,
  createRoom,
  joinRoom,
  sleep,
  startRig,
  waitFor,
  type TestClient,
  type TestRig,
} from "./helpers.js";

let rig: TestRig;
beforeEach(async () => {
  rig = await startRig({ maxPhraseUpdatesPerSec: 8 });
});
afterEach(async () => {
  await rig.close();
});

const phrase = (revision: number, onsets: Onset[]): Phrase => ({
  instrumentId: "tabla",
  revision,
  onsets,
});
const hit = (step: number): Onset => ({ step, velocity: 0.8, stroke: "outer" });

async function pair(): Promise<{ a: TestClient; b: TestClient; code: string }> {
  const a = rig.connect();
  const { room } = await createRoom(a, "A");
  const b = rig.connect();
  await joinRoom(b, room.code, "B");
  return { a, b, code: room.code };
}

describe("fan-out", () => {
  it("reaches everyone except the author — their phone already played it", async () => {
    const { a, b } = await pair();
    const echoed = collect(a, "phrase:changed");
    const heard = waitFor(b, "phrase:changed");

    a.emit("phrase:update", phrase(1, [hit(0), hit(8)]));
    const got = await heard;
    expect(got.phrase.onsets).toHaveLength(2);
    await sleep(120);
    expect(echoed.all()).toHaveLength(0);
  });

  it("clears travel too", async () => {
    const { a, b } = await pair();
    a.emit("phrase:update", phrase(1, [hit(0)]));
    await waitFor(b, "phrase:changed");
    const cleared = waitFor(b, "phrase:cleared");
    a.emit("phrase:clear");
    expect((await cleared).participantId).toBeDefined();
  });
});

describe("validation — the density guarantee is the room's, not the client's", () => {
  it("rejects a phrase denser than the cap", async () => {
    const { a, b } = await pair();
    const cap = maxOnsets(2, 8);
    const tooMany = Array.from({ length: cap + 1 }, (_, i) => hit(i));
    const complaint = waitFor(a, "error");
    const leaked = collect(b, "phrase:changed");

    a.emit("phrase:update", phrase(1, tooMany));
    expect((await complaint).code).toBe("INVALID_PHRASE");
    await sleep(120);
    expect(leaked.all()).toHaveLength(0);
  });

  it.each([
    ["a step off the grid", [{ step: 32, velocity: 0.8, stroke: "outer" }]],
    ["a negative step", [{ step: -1, velocity: 0.8, stroke: "outer" }]],
    ["velocity above one", [{ step: 0, velocity: 1.4, stroke: "outer" }]],
    ["an unknown stroke", [{ step: 0, velocity: 0.8, stroke: "slap" }]],
    ["two onsets on one step", [hit(4), hit(4)]],
  ])("rejects %s", async (_label, onsets) => {
    const { a } = await pair();
    const complaint = waitFor(a, "error");
    a.emit("phrase:update", phrase(1, onsets as Onset[]));
    expect((await complaint).code).toBe("INVALID_PHRASE");
  });

  it("rejects an instrument that is not in the roster", async () => {
    const { a } = await pair();
    const complaint = waitFor(a, "error");
    a.emit("phrase:update", { instrumentId: "kazoo", revision: 1, onsets: [hit(0)] });
    expect((await complaint).code).toBe("INVALID_PHRASE");
  });
});

describe("revisions", () => {
  it("drops a stale revision — bad wifi must not resurrect a replaced phrase", async () => {
    const { a, b } = await pair();
    const heard = collect(b, "phrase:changed");

    a.emit("phrase:update", phrase(5, [hit(0)]));
    await sleep(120);
    a.emit("phrase:update", phrase(3, [hit(4), hit(8)])); // the delayed packet
    await sleep(150);

    const all = heard.all();
    expect(all).toHaveLength(1);
    expect(all[0].phrase.revision).toBe(5);
  });

  it("lets a fresh take start over after a clear", async () => {
    // Laying down a new groove clears, then publishes from revision 1 again.
    // Monotonicity must reset at the clear or every new take would be dropped.
    const { a, b } = await pair();
    a.emit("phrase:update", phrase(9, [hit(0)]));
    await waitFor(b, "phrase:changed");
    a.emit("phrase:clear");
    await waitFor(b, "phrase:cleared");

    const fresh = waitFor(b, "phrase:changed");
    a.emit("phrase:update", phrase(1, [hit(12)]));
    expect((await fresh).phrase.revision).toBe(1);
  });
});

describe("rate limiting", () => {
  it("shuts off a runaway client without punishing a human", async () => {
    const { a } = await pair();
    const complaints = collect(a, "error");
    for (let i = 0; i < 20; i++) a.emit("phrase:update", phrase(i + 1, [hit(0)]));
    await sleep(250);
    expect(complaints.all().some((e) => e.code === "RATE_LIMITED")).toBe(true);
  });
});
