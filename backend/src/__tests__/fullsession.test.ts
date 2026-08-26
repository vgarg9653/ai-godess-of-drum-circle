/**
 * EVAL: a whole evening, scripted.
 *
 * Eight people run the complete arc a real room would: gather, choose
 * instruments, vote, begin, publish their interlocked parts, lose somebody
 * mid-session, lose the HOST mid-session, and still close properly with a
 * summary in every remaining hand.
 *
 * Each scripted client derives its part with the same shared `distributeRole`
 * the phones use — so this eval also proves server and client arithmetic agree
 * end to end, which is the whole reason `shared/` exists.
 *
 * Then: thirty-one phones at once, because "scales from 5 to 60" is a claim
 * until it is a test.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  distributeRole,
  getSong,
  maxOnsets,
  type Phrase,
  type SessionSummary,
} from "@godc/shared";
import {
  collect,
  createRoom,
  joinRoom,
  selectInstrument,
  sleep,
  startRig,
  waitFor,
  type TestClient,
  type TestRig,
} from "./helpers.js";

describe("one full session, eight people", () => {
  let rig: TestRig;
  beforeAll(async () => {
    rig = await startRig();
  });
  afterAll(async () => {
    await rig.close();
  });

  it("holds together from gathering to the closing summary", async () => {
    /* ---- gather ---- */
    const host = rig.connect();
    const { room } = await createRoom(host, "Asha", "song", "small");
    const code = room.code;
    const hostId = room.participants[0].id;

    const guests: Array<{ socket: TestClient; id: string; name: string }> = [];
    for (let i = 0; i < 7; i++) {
      const socket = rig.connect();
      const joined = await joinRoom(socket, code, `Guest${i}`);
      guests.push({ socket, id: joined.youId, name: `Guest${i}` });
      await sleep(10); // real join-order gaps
    }
    const everyone = [{ socket: host, id: hostId, name: "Asha" }, ...guests];

    /* ---- vote, with a genuine spread. No instrument screen in song mode:
            the arrangement deals them at the settle. ---- */
    const ballots = ["chaiyya", "chaiyya", "rockYou", "kunFayaKun", "chaiyya", "rockYou"];
    everyone.slice(0, ballots.length).forEach((person, i) => {
      person.socket.emit("song:vote", { songId: ballots[i] });
    });
    await sleep(200);

    /* ---- begin ---- */
    const chosenPromises = everyone.map((p) => waitFor(p.socket, "song:chosen"));
    const beganPromise = waitFor(host, "session:began");
    host.emit("session:begin");
    const [settled] = await Promise.all(chosenPromises);
    const transport = await beganPromise;

    expect(settled.songId).toBe("chaiyya"); // the majority got their wish
    const song = getSong(settled.songId)!;
    expect(transport.bpm).toBe(song.bpm);

    /* ---- each phone derives and publishes its own interlocked part ---- */
    const membersOf = (roleId: string) =>
      Object.values(settled.parts).filter((p) => p.roleId === roleId).length;
    const cap = maxOnsets(everyone.length, song.cycleBeats);
    const published = new Map<string, Phrase>();
    // The instruments were dealt with the parts.
    const instrumentOf = new Map<string, string>(
      Object.entries(settled.parts).map(([id, p]) => [id, p.instrumentId]),
    );
    // A listener attached BEFORE anyone publishes, so fan-out is provable.
    const witness = collect(guests[6].socket, "phrase:changed");

    for (const person of everyone) {
      const part = settled.parts[person.id];
      expect(part, `${person.name} was left without a part`).toBeDefined();
      const role = song.roles.find((r) => r.id === part.roleId)!;
      const onsets = distributeRole(
        role,
        part.rolePart,
        membersOf(part.roleId),
        everyone.length,
        song.cycleBeats,
      );
      expect(onsets.length).toBeGreaterThan(0);
      expect(onsets.length).toBeLessThanOrEqual(cap);
      const phrase: Phrase = {
        instrumentId: instrumentOf.get(person.id)!,
        revision: 1,
        onsets,
      };
      published.set(person.id, phrase);
      person.socket.emit("phrase:update", phrase);
    }

    // Everyone else's part reaches the witness — seven distinct voices, and
    // never an echo of their own.
    await sleep(400);
    const voicesHeard = new Set(witness.all().map((p) => p.participantId));
    expect(voicesHeard.size).toBe(everyone.length - 1);
    expect(voicesHeard.has(guests[6].id)).toBe(false);

    /* ---- one guest slips out ---- */
    const leaver = guests[5];
    const left = waitFor(host, "participant:left");
    leaver.socket.emit("room:leave");
    expect((await left).participantId).toBe(leaver.id);

    /* ---- then the HOST leaves. The circle must not orphan ---- */
    const succession = waitFor(guests[0].socket, "host:changed");
    host.emit("room:leave");
    const handOver = await succession;
    expect(handOver.participantId).toBe(guests[0].id); // longest-present
    expect(handOver.previousHostId).toBe(hostId);

    /* ---- the heir closes the circle ---- */
    const remaining = guests.filter((g) => g.id !== leaver.id);
    const summaryPromises = remaining.map((g) =>
      waitFor(g.socket, "session:ended", 6000),
    );
    guests[0].socket.emit("session:end");
    const summaries = await Promise.all(summaryPromises);

    /* ---- the close-out adds up ---- */
    const first: SessionSummary = summaries[0];
    expect(first.participantCount).toBe(remaining.length);
    expect(first.room.roster.map((r) => r.name).sort()).toEqual(
      remaining.map((g) => g.name).sort(),
    );

    const expectedTotal = remaining.reduce(
      (sum, g) => sum + (published.get(g.id)?.onsets.length ?? 0),
      0,
    );
    expect(first.room.totalOnsets).toBe(expectedTotal);
    const weaveSum = Object.values(first.room.weave)
      .flat()
      .reduce((a, b) => a + b, 0);
    expect(weaveSum).toBe(expectedTotal);

    // Personal figures are each person's own, and only their own.
    summaries.forEach((summary, i) => {
      const me = remaining[i];
      expect(summary.you.instrumentId).toBe(instrumentOf.get(me.id));
      expect(summary.you.onsetsPlayed).toBe(published.get(me.id)!.onsets.length);
    });
    // And the shared half is identical for everyone.
    for (const summary of summaries.slice(1)) {
      expect(summary.room).toEqual(first.room);
    }
  });
});

describe("thirty-one phones", () => {
  let rig: TestRig;
  beforeAll(async () => {
    rig = await startRig();
  });
  afterAll(async () => {
    await rig.close();
  });

  it("gathers, begins, and fans thirty grooves out without falling over", async () => {
    const host = rig.connect();
    const { room } = await createRoom(host, "Host", "jam", "large");

    const guests: TestClient[] = [];
    for (let i = 0; i < 30; i++) {
      const socket = rig.connect();
      await joinRoom(socket, room.code, `P${i}`);
      guests.push(socket);
    }
    await selectInstrument(host);
    for (const guest of guests) await selectInstrument(guest);

    host.emit("session:begin");
    await waitFor(host, "session:began");

    // Every guest lays down a legal groove at the 31-person density cap.
    const cap = maxOnsets(31, 8);
    const heard = collect(host, "phrase:changed");
    const started = performance.now();
    guests.forEach((guest, i) => {
      guest.emit("phrase:update", {
        instrumentId: "tabla",
        revision: 1,
        onsets: Array.from({ length: cap }, (_, k) => ({
          step: (i + k * 5) % 32,
          velocity: 0.8,
          stroke: "outer" as const,
        })).filter(
          (onset, index, list) =>
            list.findIndex((o) => o.step === onset.step) === index,
        ),
      });
    });

    // All thirty must reach the host, promptly.
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error(`only ${heard.all().length} of 30 arrived`)),
        8000,
      );
      const check = setInterval(() => {
        if (new Set(heard.all().map((p) => p.participantId)).size === 30) {
          clearTimeout(deadline);
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(5000);

    // And the room still closes cleanly at this size.
    const ended = waitFor(host, "session:ended", 6000);
    host.emit("session:end");
    const summary = await ended;
    expect(summary.participantCount).toBe(31);
    expect(summary.room.roster).toHaveLength(31);
  }, 30_000);
});
