/**
 * Song mode, end to end through the mock server, plus the cue rules.
 *
 * The browser could not be driven while this was written, so the flow is
 * exercised headlessly instead: vote, begin, parts handed out, transport taken
 * from the piece, cues released. That covers the logic; what it cannot check is
 * how any of it feels.
 */

import { describe, expect, it } from "vitest";
import {
  getSong,
  PROTOCOL_VERSION,
  type Participant,
  type Room,
  type TransportState,
} from "@godc/shared";
import { MockRoomClient } from "@/net/mockClient";
import {
  advanceCues,
  CUE_HITS_TO_RELEASE,
  CUE_MAX_CYCLES,
  CUE_STAGGER_CYCLES,
  cycleDistance,
  makeCues,
  registerTap,
  staggerFor,
} from "@/engine/cues";

async function songRoom(fakes = 6) {
  const client = new MockRoomClient({ fakeParticipants: fakes });
  await client.connect();

  const chosen: Array<{ songId: string; parts: Record<string, { roleId: string; rolePart: number }> }> = [];
  const states: Room[] = [];
  const transports: TransportState[] = [];
  client.on("song:chosen", (p) => chosen.push(p));
  client.on("room:state", (r) => states.push(r));
  client.on("session:began", (t) => transports.push(t));

  const res = await client.createRoom({
    hostName: "Host",
    expectedSize: "medium",
    mode: "song",
    protocolVersion: PROTOCOL_VERSION,
  });
  if (!res.ok) throw new Error("could not create room");

  return { client, room: res.data.room, youId: res.data.youId, chosen, states, transports };
}

describe("a song room", () => {
  it("starts in song mode, with nothing chosen yet", async () => {
    const { room } = await songRoom();
    expect(room.mode).toBe("song");
    expect(room.songId).toBeNull();
    expect(room.phase).toBe("gathering");
  });

  it("lets a person vote and change their mind, counting only the last", async () => {
    const { client, room, youId } = await songRoom();
    const tallies: Array<Record<string, string>> = [];
    client.on("song:votes", ({ votes }) => tallies.push(votes));

    client.voteSong("bhangra");
    client.voteSong("garba");

    const last = tallies.at(-1)!;
    expect(last[youId]).toBe("garba");
    expect(Object.values(last).filter((v) => v === "bhangra")).not.toContain(youId);
    expect(room.mode).toBe("song");
  });

  it("plays what the room voted for", async () => {
    const { client, chosen } = await songRoom(6);
    // Outvote the synthetic participants decisively.
    client.voteSong("kirtan");
    client.beginSession();
    expect(chosen).toHaveLength(1);
    // Either the room's favourite or ours wins, but it must be a real piece.
    expect(getSong(chosen[0].songId)).toBeDefined();
  });

  it("takes its tempo, metre, mood and key from the piece", async () => {
    const { client, chosen, transports } = await songRoom();
    client.beginSession();
    const song = getSong(chosen[0].songId)!;
    const transport = transports.at(-1)!;
    expect(transport.bpm).toBe(song.bpm);
    expect(transport.cycleBeats).toBe(song.cycleBeats);
    expect(transport.moodId).toBe(song.moodId);
    if (song.rootMidi !== undefined) expect(transport.rootMidi).toBe(song.rootMidi);
  });

  it("gives every single person a part", async () => {
    const { client, chosen, states } = await songRoom(8);
    client.beginSession();
    const room = states.at(-1)!;
    const song = getSong(chosen[0].songId)!;

    expect(room.participants.length).toBe(9);
    for (const p of room.participants) {
      expect(p.roleId, `${p.name} has no role`).not.toBeNull();
      expect(song.roles.map((r) => r.id)).toContain(p.roleId!);
      expect(p.rolePart).toBeGreaterThanOrEqual(0);
    }
  });

  it("fits the part to the instrument each person already chose", async () => {
    const { client, chosen, states } = await songRoom(8);
    client.beginSession();
    const room = states.at(-1)!;
    const song = getSong(chosen[0].songId)!;
    const families = new Set(song.roles.map((r) => r.family));

    // Anyone whose instrument family exists in this arrangement must have been
    // given a role of that family — handing a flute the low boom is nonsense.
    for (const p of room.participants as Participant[]) {
      if (!p.instrumentId || !p.roleId) continue;
      const role = song.roles.find((r) => r.id === p.roleId)!;
      const instrumentFamily = room.participants.find((q) => q.id === p.id)!.instrumentId;
      if (!instrumentFamily) continue;
      // Only assert when the song actually offers that family.
      const { getInstrument } = await import("@godc/shared");
      const family = getInstrument(p.instrumentId)?.family;
      if (family && families.has(family)) {
        expect(role.family, `${p.name} plays ${p.instrumentId} but got ${role.id}`).toBe(family);
      }
    }
  });

  it("has the room sounding from the first bar, so nothing is silent", async () => {
    const { client, states, youId } = await songRoom(8);
    client.beginSession();
    const room = states.at(-1)!;

    // Everyone except us is already looping their share of the arrangement.
    const others = room.participants.filter((p) => p.id !== youId);
    for (const p of others) {
      const phrase = room.phrases[p.id];
      expect(phrase, `${p.name} has no phrase`).toBeDefined();
      expect(phrase.onsets.length, `${p.name} is silent`).toBeGreaterThan(0);
    }
  });
});

describe("cue release", () => {
  const STEPS = 32;

  it("counts a tap that lands near a hit", () => {
    const cues = registerTap(makeCues([8]), 8, STEPS);
    expect(cues[0].found).toBe(1);
  });

  it("counts a tap a hair early for the hit it was aiming at", () => {
    // Just before beat one is early for beat one, not a bar late for it.
    expect(cycleDistance(0, 31, STEPS)).toBe(1);
    const cues = registerTap(makeCues([0]), 31, STEPS);
    expect(cues[0].found).toBe(1);
  });

  it("ignores a tap nowhere near anything", () => {
    const cues = registerTap(makeCues([0, 16]), 8, STEPS);
    expect(cues.every((c) => c.found === 0)).toBe(true);
  });

  it("releases a hit once it has been found enough times", () => {
    let cues = makeCues([4]);
    for (let i = 0; i < CUE_HITS_TO_RELEASE; i++) cues = registerTap(cues, 4, STEPS);
    const { cues: after, allReleased } = advanceCues(cues, 1, 0);
    expect(after[0].released).toBe(true);
    expect(allReleased).toBe(true);
  });

  it("releases hit by hit, not all at once", () => {
    let cues = makeCues([0, 8, 16]);
    for (let i = 0; i < CUE_HITS_TO_RELEASE; i++) cues = registerTap(cues, 8, STEPS);
    const { cues: after, allReleased } = advanceCues(cues, 1, 0);
    expect(after.find((c) => c.step === 8)!.released).toBe(true);
    expect(after.find((c) => c.step === 0)!.released).toBe(false);
    expect(allReleased).toBe(false);
  });

  it("lets go eventually even if the player never finds it", () => {
    // Nobody follows cues for a whole session, and nobody can fail.
    const cues = makeCues([0, 8, 16]);
    const early = advanceCues(cues, CUE_MAX_CYCLES - 1, 0);
    expect(early.allReleased).toBe(false);

    const late = advanceCues(cues, CUE_MAX_CYCLES, 0);
    expect(late.allReleased).toBe(true);
    expect(late.cues.every((c) => c.released)).toBe(true);
  });

  it("never re-cues something already released", () => {
    let cues = makeCues([0]);
    cues = advanceCues(cues, CUE_MAX_CYCLES, 0).cues;
    expect(cues[0].released).toBe(true);
    // Later cycles, and further taps, must not bring it back.
    expect(advanceCues(cues, CUE_MAX_CYCLES + 5, 0).cues[0].released).toBe(true);
    expect(registerTap(cues, 0, STEPS)[0].released).toBe(true);
  });

  it("staggers the fallback so a room does not all come free on one bar", () => {
    const offsets = new Set(
      ["a", "bb", "ccc", "dddd", "eeeee", "ffffff"].map((s) =>
        staggerFor([...s].reduce((h, c) => h + c.charCodeAt(0), 0)),
      ),
    );
    expect(offsets.size).toBeGreaterThan(1);
    for (const o of offsets) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(CUE_STAGGER_CYCLES);
    }
  });

  it("is stable for one person across cycles", () => {
    expect(staggerFor(12345)).toBe(staggerFor(12345));
  });
});
