/**
 * Guards on song mode's load-bearing idea.
 *
 * The whole reason roles are interlocked rather than duplicated is that a fixed
 * pattern cannot fit inside the density cap at scale. These tests hold the two
 * halves of that bargain: nobody exceeds the cap, and the room still hears the
 * complete pattern.
 */

import { describe, expect, it } from "vitest";
import {
  assignRole,
  distributeRole,
  INSTRUMENTS,
  instrumentForSeat,
  maxOnsets,
  memberIndexFor,
  SONGS,
  unionOfParts,
  type RoleDef,
  type Song,
} from "@godc/shared";

/** Simulate a room filling up, and work out what each person ends up playing. */
function fillRoom(song: Song, people: number) {
  const takenRoleIds: string[] = [];
  const seats: Array<{ role: RoleDef; memberIndex: number }> = [];

  for (let i = 0; i < people; i++) {
    const role = assignRole(song, takenRoleIds);
    seats.push({ role, memberIndex: memberIndexFor(takenRoleIds, role.id) });
    takenRoleIds.push(role.id);
  }

  const membersOf = (roleId: string) =>
    takenRoleIds.filter((id) => id === roleId).length;

  return seats.map((seat) => ({
    role: seat.role,
    memberIndex: seat.memberIndex,
    memberCount: membersOf(seat.role.id),
    onsets: distributeRole(
      seat.role,
      seat.memberIndex,
      membersOf(seat.role.id),
      people,
      song.cycleBeats,
    ),
  }));
}

const ROOM_SIZES = [3, 5, 8, 12, 20, 30, 45, 60];

describe("every arrangement is playable at every room size", () => {
  for (const song of SONGS) {
    for (const people of ROOM_SIZES) {
      it(`${song.name} works for ${people}`, () => {
        const cap = maxOnsets(people, song.cycleBeats);
        const seats = fillRoom(song, people);

        expect(seats).toHaveLength(people);

        for (const seat of seats) {
          // Nobody may break the room's density budget.
          expect(
            seat.onsets.length,
            `${song.id}/${seat.role.id} member ${seat.memberIndex} has ${seat.onsets.length} > cap ${cap}`,
          ).toBeLessThanOrEqual(cap);

          // Nobody may be handed an empty part.
          expect(
            seat.onsets.length,
            `${song.id}/${seat.role.id} member ${seat.memberIndex} got nothing to play`,
          ).toBeGreaterThan(0);

          // Onsets must land on the grid for this cycle.
          for (const onset of seat.onsets) {
            expect(onset.step).toBeGreaterThanOrEqual(0);
            expect(onset.step).toBeLessThan(song.cycleBeats * 4);
          }
        }
      });
    }
  }
});

describe("the room hears the whole pattern", () => {
  for (const song of SONGS) {
    it(`${song.name}: every role's hits survive being shared out`, () => {
      for (const people of ROOM_SIZES) {
        const seats = fillRoom(song, people);
        const roleIds = new Set(seats.map((s) => s.role.id));

        for (const roleId of roleIds) {
          const role = song.roles.find((r) => r.id === roleId)!;
          const members = seats.filter((s) => s.role.id === roleId).length;
          const covered = unionOfParts(role, members, people, song.cycleBeats);
          const expected = new Set(role.pattern.map((h) => h.step));

          for (const step of expected) {
            expect(
              covered.has(step),
              `${song.id}/${roleId} lost step ${step} with ${members} of ${people}`,
            ).toBe(true);
          }
        }
      }
    });
  }
});

describe("the authoring rule", () => {
  it("keeps every pattern inside what one person may play", () => {
    // The binding case is a role held by a single person in a room just big
    // enough to have tightened the cap. Eight people is the worst of it: the
    // cap is down to eight onsets while roles still have only one member each.
    //
    // This is the rule an arrangement must satisfy to be playable at all, and
    // the one a generated arrangement has to be checked against.
    const WORST_CASE_CAP = maxOnsets(8, 8);
    for (const song of SONGS) {
      for (const role of song.roles) {
        expect(
          role.pattern.length,
          `${song.id}/${role.id} has ${role.pattern.length} hits, more than one person may play`,
        ).toBeLessThanOrEqual(WORST_CASE_CAP);
      }
    }
  });

  it("keeps role counts in the range the brief asks for", () => {
    for (const song of SONGS) {
      expect(song.roles.length, `${song.id}`).toBeGreaterThanOrEqual(5);
      expect(song.roles.length, `${song.id}`).toBeLessThanOrEqual(7);
    }
  });

  it("locks only instruments that actually exist in the kit", () => {
    // A typo here is a phone told to play a sound that is not on disk.
    const ids = new Set(INSTRUMENTS.map((i) => i.id));
    for (const song of SONGS) {
      for (const role of song.roles) {
        expect(role.instruments.length, `${song.id}/${role.id}`).toBeGreaterThan(0);
        for (const instrumentId of role.instruments) {
          expect(ids.has(instrumentId), `${song.id}/${role.id} -> ${instrumentId}`).toBe(true);
        }
      }
    }
  });

  it("gives every song a distinct priority order", () => {
    for (const song of SONGS) {
      const priorities = song.roles.map((r) => r.priority);
      expect(new Set(priorities).size, `${song.id} has duplicate priorities`).toBe(
        priorities.length,
      );
    }
  });

  it("stays inside the tempo range the host slider can express", () => {
    for (const song of SONGS) {
      expect(song.bpm, `${song.id}`).toBeGreaterThanOrEqual(60);
      expect(song.bpm, `${song.id}`).toBeLessThanOrEqual(120);
    }
  });
});

describe("anchors", () => {
  it("are played by everyone in the role, so the downbeat never rests on one person", () => {
    for (const song of SONGS) {
      for (const role of song.roles) {
        const anchors = role.pattern.filter((h) => h.anchor).map((h) => h.step);
        if (anchors.length === 0) continue;
        for (let i = 0; i < 6; i++) {
          const steps = distributeRole(role, i, 6, 30, song.cycleBeats).map((o) => o.step);
          for (const anchor of anchors) {
            expect(steps, `${song.id}/${role.id} member ${i}`).toContain(anchor);
          }
        }
      }
    }
  });

  it("gives every song a spine, without forcing one on every role", () => {
    // Not every role should be anchored. The offbeat parts exist precisely to
    // avoid the downbeat, and anchoring them would put their whole section on
    // beat one and destroy what they are for. What must hold is narrower: the
    // parts a small room actually receives have to carry the cycle.
    for (const song of SONGS) {
      const anchored = song.roles.filter((r) => r.pattern.some((h) => h.anchor));
      expect(anchored.length, `${song.id} has no anchored role at all`).toBeGreaterThan(0);

      const carrying = [...song.roles]
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 2);
      for (const role of carrying) {
        expect(
          role.pattern.some((h) => h.anchor),
          `${song.id}/${role.id} carries the piece but has no anchor`,
        ).toBe(true);
      }
    }
  });
});

describe("interlocking actually interlocks", () => {
  it("gives people in the same role different parts", () => {
    // If two members of a dense role play identical parts, the room gets
    // comb filtering instead of an ensemble.
    const song = SONGS.find((s) => s.id === "chaiyya")!;
    const dholak = song.roles.find((r) => r.id === "dholak")!;
    const a = distributeRole(dholak, 0, 4, 20, song.cycleBeats).map((o) => o.step);
    const b = distributeRole(dholak, 1, 4, 20, song.cycleBeats).map((o) => o.step);
    expect(a).not.toEqual(b);
  });

  it("hands one person the whole pattern when they are alone in the role", () => {
    const song = SONGS.find((s) => s.id === "standByMe")!;
    const bassline = song.roles.find((r) => r.id === "bassline")!;
    const solo = distributeRole(bassline, 0, 1, 6, song.cycleBeats).map((o) => o.step);
    expect(solo).toEqual(
      bassline.pattern.map((h) => h.step).sort((x, y) => x - y),
    );
  });

  it("is deterministic", () => {
    const song = SONGS[0];
    const role = song.roles[0];
    const once = distributeRole(role, 2, 5, 24, song.cycleBeats);
    const twice = distributeRole(role, 2, 5, 24, song.cycleBeats);
    expect(once).toEqual(twice);
  });
});

describe("role assignment", () => {
  it("fills the parts that carry the piece before doubling up", () => {
    const song = SONGS.find((s) => s.id === "chaiyya")!;
    const taken: string[] = [];
    for (let i = 0; i < 3; i++) {
      taken.push(assignRole(song, taken).id);
    }
    // Three people get the three highest-priority roles, not three shimmers.
    const priorities = taken.map(
      (id) => song.roles.find((r) => r.id === id)!.priority,
    );
    expect(priorities.sort()).toEqual([1, 2, 3]);
  });

  it("keeps the song's instrument ratio as the room grows", () => {
    // We Will Rock You is stomps and claps or it is nothing. Weight 3 on each
    // means sixty people stay roughly three-to-one stomp-and-clap against the
    // decoration, instead of evening out into an equal split.
    const song = SONGS.find((s) => s.id === "rockYou")!;
    const taken: string[] = [];
    for (let i = 0; i < 60; i++) taken.push(assignRole(song, taken).id);

    const count = (id: string) => taken.filter((r) => r === id).length;
    for (const role of song.roles) {
      expect(count(role.id), `${role.id} left empty`).toBeGreaterThan(0);
    }
    expect(count("stomp")).toBeGreaterThan(count("chord") * 2);
    expect(count("clap")).toBeGreaterThan(count("chord") * 2);
  });

  it("deals each seat its locked instrument, round-robin", () => {
    const song = SONGS.find((s) => s.id === "chaiyya")!;
    const dholak = song.roles.find((r) => r.id === "dholak")!;
    // ["dholak", "tabla"] alternates by seat; a fifth player wraps around.
    expect(instrumentForSeat(dholak, 0)).toBe("dholak");
    expect(instrumentForSeat(dholak, 1)).toBe("tabla");
    expect(instrumentForSeat(dholak, 2)).toBe("dholak");
  });

  it("never leaves a small room without a pulse", () => {
    for (const song of SONGS) {
      const taken: string[] = [assignRole(song, []).id];
      const first = song.roles.find((r) => r.id === taken[0])!;
      expect(first.priority).toBe(1);
    }
  });
});
