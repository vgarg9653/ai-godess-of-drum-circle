/**
 * EVAL: song mode on the wire.
 *
 * The arrangement itself never travels — the eval checks the server sends only
 * songId + roleId + rolePart, that roles fit the instruments people already
 * hold, and that somebody arriving after the vote still gets a part.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SONGS, getInstrument, getSong } from "@godc/shared";
import {
  createRoom,
  joinRoom,
  selectInstrument,
  sleep,
  startRig,
  waitFor,
  type TestClient,
  type TestRig,
} from "./helpers.js";

let rig: TestRig;
beforeEach(async () => {
  rig = await startRig();
});
afterEach(async () => {
  await rig.close();
});

async function songRoom(guests: number): Promise<{
  host: TestClient;
  others: TestClient[];
  code: string;
  ids: string[];
}> {
  const host = rig.connect();
  const { room, youId } = await createRoom(host, "Host", "song");
  const others: TestClient[] = [];
  const ids = [youId];
  for (let i = 0; i < guests; i++) {
    const s = rig.connect();
    const joined = await joinRoom(s, room.code, `P${i}`);
    ids.push(joined.youId);
    others.push(s);
  }
  return { host, others, code: room.code, ids };
}

describe("voting", () => {
  it("fans the moving tally to the whole room, last vote per person counting", async () => {
    const { host, others } = await songRoom(2);
    const tally = waitFor(others[1], "song:votes");
    host.emit("song:vote", { songId: "garba" });
    const first = await tally;
    expect(Object.values(first.votes)).toContain("garba");

    const changed = waitFor(others[1], "song:votes");
    host.emit("song:vote", { songId: "bhangra" });
    const second = await changed;
    expect(Object.values(second.votes)).toContain("bhangra");
    expect(Object.values(second.votes)).not.toContain("garba");
  });

  it("ignores a songId that is not in the catalogue", async () => {
    const { host, others } = await songRoom(1);
    let heard = false;
    others[0].on("song:votes", () => {
      heard = true;
    });
    host.emit("song:vote", { songId: "never-gonna-give-you-up" });
    await sleep(150);
    expect(heard).toBe(false);
  });
});

describe("the settle", () => {
  it("plays what the room voted for and hands every person a part", async () => {
    const { host, others, ids } = await songRoom(3);
    await selectInstrument(host);
    for (const s of others) await selectInstrument(s);

    host.emit("song:vote", { songId: "kirtan" });
    others[0].emit("song:vote", { songId: "kirtan" });
    others[1].emit("song:vote", { songId: "baraat" as string });
    await sleep(150);

    const chosen = waitFor(others[2], "song:chosen");
    const began = waitFor(others[2], "session:began");
    host.emit("session:begin");

    const settled = await chosen;
    expect(settled.songId).toBe("kirtan");
    const song = getSong(settled.songId)!;
    for (const id of ids) {
      const part = settled.parts[id];
      expect(part, `${id} has no part`).toBeDefined();
      expect(song.roles.some((r) => r.id === part.roleId)).toBe(true);
    }

    // The piece sets the room's transport.
    const transport = await began;
    expect(transport.bpm).toBe(song.bpm);
    expect(transport.cycleBeats).toBe(song.cycleBeats);
    expect(transport.moodId).toBe(song.moodId);
  });

  it("fits roles to the instruments people already chose", async () => {
    const { host, others, ids } = await songRoom(3);
    // Deliberate spread: a melody, a deep drum, two beats. Handing the sitar
    // player the low boom would make nonsense of both.
    const instruments: Record<string, string> = {
      [ids[0]]: "sitar",
      [ids[1]]: "dhol",
      [ids[2]]: "tabla",
      [ids[3]]: "dholak",
    };
    await selectInstrument(host, instruments[ids[0]]);
    await selectInstrument(others[0], instruments[ids[1]]);
    await selectInstrument(others[1], instruments[ids[2]]);
    await selectInstrument(others[2], instruments[ids[3]]);

    host.emit("song:vote", { songId: SONGS[0].id });
    const chosen = waitFor(host, "song:chosen");
    host.emit("session:begin");
    const settled = await chosen;
    const song = getSong(settled.songId)!;
    const offered = new Set(song.roles.map((r) => r.family));

    expect(Object.keys(settled.parts)).toHaveLength(4);
    for (const [pid, instrumentId] of Object.entries(instruments)) {
      const family = getInstrument(instrumentId)!.family;
      if (!offered.has(family)) continue; // song has no such part; any role is fine
      const role = song.roles.find((r) => r.id === settled.parts[pid].roleId)!;
      expect(role.family, `${instrumentId} was given ${role.id}`).toBe(family);
    }
  });

  it("gives a late arrival a part of their own, privately", async () => {
    const { host, code } = await songRoom(2);
    await selectInstrument(host);
    host.emit("session:begin");
    await waitFor(host, "session:began");

    const late = rig.connect();
    const joined = await joinRoom(late, code, "Latecomer");
    expect(joined.room.songId).not.toBeNull();

    const part = waitFor(late, "song:chosen");
    await selectInstrument(late);
    const settled = await part;
    expect(settled.songId).toBe(joined.room.songId);
    const mine = settled.parts[joined.youId];
    expect(mine).toBeDefined();
    const song = getSong(settled.songId)!;
    expect(song.roles.some((r) => r.id === mine.roleId)).toBe(true);
  });
});
