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
    host.emit("song:vote", { songId: "chaiyya" });
    const first = await tally;
    expect(Object.values(first.votes)).toContain("chaiyya");

    const changed = waitFor(others[1], "song:votes");
    host.emit("song:vote", { songId: "standByMe" });
    const second = await changed;
    expect(Object.values(second.votes)).toContain("standByMe");
    expect(Object.values(second.votes)).not.toContain("chaiyya");
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

    host.emit("song:vote", { songId: "kunFayaKun" });
    others[0].emit("song:vote", { songId: "kunFayaKun" });
    others[1].emit("song:vote", { songId: "rockYou" as string });
    await sleep(150);

    const chosen = waitFor(others[2], "song:chosen");
    const began = waitFor(others[2], "session:began");
    host.emit("session:begin");

    const settled = await chosen;
    expect(settled.songId).toBe("kunFayaKun");
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

  it("deals the song's locked instruments — the arrangement, not the person, decides", async () => {
    const { host, ids } = await songRoom(3);

    host.emit("song:vote", { songId: SONGS[0].id });
    const chosen = waitFor(host, "song:chosen");
    host.emit("session:begin");
    const settled = await chosen;
    const song = getSong(settled.songId)!;

    expect(Object.keys(settled.parts)).toHaveLength(4);
    for (const id of ids) {
      const part = settled.parts[id];
      const role = song.roles.find((r) => r.id === part.roleId)!;
      // The dealt instrument is the role's, by seat.
      expect(part.instrumentId).toBe(
        role.instruments[part.rolePart % role.instruments.length],
      );
      expect(getInstrument(part.instrumentId), part.instrumentId).toBeDefined();
    }
  });

  it("deals a late arrival their part at the door, instrument included", async () => {
    const { host, code } = await songRoom(2);
    host.emit("session:begin");
    await waitFor(host, "session:began");

    const late = rig.connect();
    // The part arrives right behind the join ack — listen before joining.
    const part = waitFor(late, "song:chosen");
    const joined = await joinRoom(late, code, "Latecomer");
    expect(joined.room.songId).not.toBeNull();

    const settled = await part;
    expect(settled.songId).toBe(joined.room.songId);
    const mine = settled.parts[joined.youId];
    expect(mine).toBeDefined();
    const song = getSong(settled.songId)!;
    const role = song.roles.find((r) => r.id === mine.roleId)!;
    expect(role.instruments).toContain(mine.instrumentId);
  });
});
