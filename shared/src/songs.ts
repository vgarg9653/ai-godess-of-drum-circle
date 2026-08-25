/**
 * Song arrangements.
 *
 * A song here is not a recording — nothing of the original is played back. It is
 * a set of musical decisions (tempo, key, mood, cycle) plus a handful of *roles*,
 * each carrying a rhythmic pattern. The room plays its own instruments in the
 * world of the piece.
 *
 * Arrangements are static and precomputed. Nothing here is generated at runtime.
 *
 * The first catalogue is deliberately traditional and public-domain. That is
 * partly a licensing decision and partly a musical one: taals and West African
 * bell patterns are *already* interlocking ensemble music, which is exactly the
 * mechanism this mode is built on.
 */

import type { Family } from "./instruments.js";
import type { MoodId } from "./music.js";
import type { Stroke } from "./protocol.js";

/**
 * One hit in a role's pattern.
 *
 * `step` is on the same 16th-note grid everything else uses, so a pattern drops
 * straight into a Phrase with no conversion.
 */
export interface PatternHit {
  step: number;
  stroke: Stroke;
  /** 0..1. Defaults to 0.85 when omitted. */
  velocity?: number;
  /** Scale degree, for pitched roles. Unpitched roles ignore it. */
  degree?: number;
  /**
   * Everyone in this role plays this hit, rather than it being shared out.
   *
   * Reserved for the hits that hold the cycle together — usually beat one. A
   * room where only one person plays the downbeat has a fragile pulse; a room
   * where everyone does has a spine.
   */
  anchor?: boolean;
}

/**
 * A part in the arrangement, played by one *or many* people.
 *
 * Roles rather than individual parts is what lets one arrangement serve a room
 * of five and a room of sixty. See `interlock.ts` for how a role's pattern is
 * shared out among the people playing it.
 */
export interface RoleDef {
  id: string;
  /** Shown to the player. Plain language, never music theory. */
  name: string;
  /** One line on what this part does in the piece. */
  hint: string;
  /** Which instrument family fills this role. Allocation stays family-based. */
  family: Family;
  /**
   * Fill order when there are fewer people than roles.
   *
   * A room of five must still sound like the piece, so the roles that carry its
   * identity come first and the decoration comes last.
   */
  priority: number;
  pattern: PatternHit[];
}

export interface Song {
  id: string;
  name: string;
  /** Where the piece comes from. Shown quietly under the name. */
  origin: string;
  /** What it feels like to be in. Never theory. */
  description: string;
  bpm: number;
  cycleBeats: number;
  moodId: MoodId;
  /**
   * Root note override, when the piece wants a key its mood does not supply.
   * Omitted means the mood's own root is used.
   */
  rootMidi?: number;
  roles: RoleDef[];
}

/* ------------------------------------------------------------------ *
 * Helpers for authoring patterns
 * ------------------------------------------------------------------ */

const hit = (
  step: number,
  stroke: Stroke = "outer",
  extra: Omit<PatternHit, "step" | "stroke"> = {},
): PatternHit => ({ step, stroke, ...extra });

/** Beat `b` of the cycle, on the 16th-note grid. */
const beat = (b: number): number => b * 4;

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

export const SONGS: readonly Song[] = [
  {
    id: "keherwa",
    name: "Keherwa",
    origin: "Hindustani · traditional",
    description: "Eight beats, light on its feet. The one everybody can find.",
    bpm: 96,
    cycleBeats: 8,
    moodId: "monsoon",
    roles: [
      {
        id: "pulse",
        name: "Keep the beat",
        hint: "Steady. Everything else leans on you.",
        family: "rhythm",
        priority: 1,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 0.95 }),
          hit(beat(2)), hit(beat(4)), hit(beat(6)),
        ],
      },
      {
        id: "ground",
        name: "The low boom",
        hint: "Low and slow. You are the floor of the room.",
        family: "bass",
        priority: 2,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 1 }),
          hit(beat(3), "center"), hit(beat(4)),
        ],
      },
      {
        id: "answer",
        name: "In the gaps",
        hint: "You land between the others, not with them.",
        family: "rhythm",
        priority: 3,
        pattern: [
          hit(beat(1), "center"), hit(beat(3)),
          hit(beat(5), "center"), hit(beat(7)),
        ],
      },
      {
        id: "colour",
        name: "Fast and light",
        hint: "Fast and light, over the top of everything.",
        family: "rhythm",
        priority: 5,
        pattern: [
          hit(2), hit(6), hit(10), hit(14),
          hit(18), hit(22), hit(26), hit(30),
        ],
      },
      {
        id: "bed",
        name: "Long notes",
        hint: "Hold a note and let it ring. Do not hurry.",
        family: "bed",
        priority: 4,
        pattern: [
          hit(beat(0), "sweep", { anchor: true, degree: 0, velocity: 0.7 }),
          hit(beat(4), "sweep", { degree: 4, velocity: 0.6 }),
        ],
      },
      {
        id: "voice",
        name: "The tune",
        hint: "The tune on top. Sparse is better than busy.",
        family: "top",
        priority: 6,
        pattern: [
          hit(beat(2), "outer", { degree: 0 }),
          hit(beat(3), "outer", { degree: 2 }),
          hit(beat(6), "outer", { degree: 4 }),
          hit(beat(7), "center", { degree: 2 }),
        ],
      },
    ],
  },

  {
    id: "teental",
    name: "Teental",
    origin: "Hindustani · traditional",
    description: "Sixteen beats. Long, unhurried, room to get lost in.",
    bpm: 78,
    cycleBeats: 16,
    moodId: "night",
    roles: [
      {
        id: "pulse",
        name: "Keep the beat",
        hint: "Mark the cycle. Four even strokes, nothing more.",
        family: "rhythm",
        priority: 1,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 0.95 }),
          hit(beat(4)), hit(beat(8), "center"), hit(beat(12)),
        ],
      },
      {
        id: "ground",
        name: "The low boom",
        hint: "Deep and rare. Let the room wait for you.",
        family: "bass",
        priority: 2,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 1 }),
          hit(beat(8), "sweep"),
        ],
      },
      {
        id: "answer",
        name: "In the gaps",
        hint: "Reply to the pulse, always a little after it.",
        family: "rhythm",
        priority: 3,
        pattern: [
          hit(beat(2)), hit(beat(6), "center"),
          hit(beat(10)), hit(beat(14), "center"),
        ],
      },
      {
        id: "colour",
        name: "Fast and light",
        hint: "A fine grain over the whole cycle.",
        family: "rhythm",
        priority: 5,
        pattern: [
          hit(beat(1)), hit(beat(3)), hit(beat(5)), hit(beat(7)),
          hit(beat(9)), hit(beat(11)), hit(beat(13)), hit(beat(15)),
        ],
      },
      {
        id: "bed",
        name: "Long notes",
        hint: "One long note per half-cycle. Breathe.",
        family: "bed",
        priority: 4,
        pattern: [
          hit(beat(0), "sweep", { anchor: true, degree: 0, velocity: 0.65 }),
          hit(beat(8), "sweep", { degree: 3, velocity: 0.6 }),
        ],
      },
      {
        id: "voice",
        name: "The tune",
        hint: "A phrase that arrives late in the cycle and resolves.",
        family: "top",
        priority: 6,
        pattern: [
          hit(beat(9), "outer", { degree: 4 }),
          hit(beat(11), "outer", { degree: 3 }),
          hit(beat(13), "outer", { degree: 1 }),
          hit(beat(15), "center", { degree: 0 }),
        ],
      },
    ],
  },

  {
    id: "rupak",
    name: "Rupak",
    origin: "Hindustani · traditional",
    description: "Seven beats. Lopsided on purpose, and strangely easy.",
    bpm: 88,
    cycleBeats: 7,
    moodId: "monsoon",
    rootMidi: 47,
    roles: [
      {
        id: "pulse",
        name: "Keep the beat",
        hint: "Three, then two, then two. Your hands will find it.",
        family: "rhythm",
        priority: 1,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 0.95 }),
          hit(beat(3)), hit(beat(5)),
        ],
      },
      {
        id: "ground",
        name: "The low boom",
        hint: "Only on the turn of the cycle.",
        family: "bass",
        priority: 2,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 1 }),
          hit(beat(5), "center"),
        ],
      },
      {
        id: "answer",
        name: "In the gaps",
        hint: "Fill the gaps the pulse leaves behind.",
        family: "rhythm",
        priority: 3,
        pattern: [
          hit(beat(1)), hit(beat(2), "center"),
          hit(beat(4)), hit(beat(6), "center"),
        ],
      },
      {
        id: "colour",
        name: "Fast and light",
        hint: "Light, quick, and everywhere.",
        family: "rhythm",
        priority: 5,
        pattern: [
          hit(2), hit(6), hit(10), hit(14), hit(18), hit(22), hit(26),
        ],
      },
      {
        id: "bed",
        name: "Long notes",
        hint: "One note, held across the whole seven.",
        family: "bed",
        priority: 4,
        pattern: [
          hit(beat(0), "sweep", { anchor: true, degree: 0, velocity: 0.7 }),
        ],
      },
    ],
  },

  {
    id: "kuku",
    name: "Kuku",
    origin: "West African · traditional",
    description: "A circle dance. Bright, driving, impossible to sit still to.",
    bpm: 112,
    cycleBeats: 8,
    moodId: "dawn",
    roles: [
      {
        id: "pulse",
        name: "Keep the beat",
        hint: "The timeline. Never change, never stop.",
        family: "rhythm",
        priority: 1,
        pattern: [
          hit(0, "outer", { anchor: true, velocity: 0.95 }),
          hit(6), hit(10), hit(16), hit(22), hit(26),
        ],
      },
      {
        id: "ground",
        name: "The low boom",
        hint: "Two heavy strokes. That is the whole job.",
        family: "bass",
        priority: 2,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 1 }),
          hit(beat(4), "outer", { velocity: 0.9 }),
        ],
      },
      {
        id: "answer",
        name: "In the gaps",
        hint: "Off the beat, always pulling forward.",
        family: "rhythm",
        priority: 3,
        pattern: [
          hit(beat(1), "center"), hit(beat(2)),
          hit(beat(5), "center"), hit(beat(6)),
        ],
      },
      {
        id: "colour",
        name: "Fast and light",
        hint: "A dry rattle through the gaps.",
        family: "rhythm",
        priority: 5,
        pattern: [
          hit(2), hit(5), hit(9), hit(13), hit(18), hit(21), hit(25), hit(29),
        ],
      },
      {
        id: "bed",
        name: "Long notes",
        hint: "Warm and open underneath it all.",
        family: "bed",
        priority: 4,
        pattern: [
          hit(beat(0), "sweep", { anchor: true, degree: 0, velocity: 0.65 }),
          hit(beat(4), "sweep", { degree: 2, velocity: 0.6 }),
        ],
      },
      {
        id: "voice",
        name: "The tune",
        hint: "Short calls, high up, leaving space between them.",
        family: "top",
        priority: 6,
        pattern: [
          hit(beat(2), "outer", { degree: 2 }),
          hit(beat(3), "center", { degree: 1 }),
          hit(beat(6), "outer", { degree: 4 }),
        ],
      },
    ],
  },

  {
    id: "bhangra",
    name: "Bhangra",
    origin: "Punjabi folk · traditional",
    description: "Wedding energy. Fast, loud, and impossible to stand still to.",
    bpm: 120,
    cycleBeats: 8,
    moodId: "dawn",
    roles: [
      {
        id: "pulse",
        name: "Keep the beat",
        hint: "Hard and even. You are the engine.",
        family: "rhythm",
        priority: 1,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 1 }),
          hit(beat(1)), hit(beat(2)), hit(beat(3)),
          hit(beat(4)), hit(beat(5)), hit(beat(6)), hit(beat(7)),
        ],
      },
      {
        id: "ground",
        name: "The low boom",
        hint: "Two big hits. Feel them in the floor.",
        family: "bass",
        priority: 2,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 1 }),
          hit(beat(4), "outer", { velocity: 0.95 }),
        ],
      },
      {
        id: "claps",
        name: "Clap along",
        hint: "Everyone claps together. Both hits, every time round.",
        family: "rhythm",
        priority: 3,
        pattern: [
          // Both anchored on purpose: unison clapping is the whole point, so
          // this role is the one place we do NOT split the pattern up.
          hit(beat(2), "outer", { anchor: true, velocity: 0.95 }),
          hit(beat(6), "outer", { anchor: true, velocity: 0.95 }),
        ],
      },
      {
        id: "answer",
        name: "In the gaps",
        hint: "Land just after the beat, never on it.",
        family: "rhythm",
        priority: 4,
        pattern: [hit(6), hit(14), hit(22), hit(30)],
      },
      {
        id: "bed",
        name: "Long notes",
        hint: "Hold one note and let it ride under everything.",
        family: "bed",
        priority: 5,
        pattern: [
          hit(beat(0), "sweep", { anchor: true, degree: 0, velocity: 0.6 }),
          hit(beat(4), "sweep", { degree: 4, velocity: 0.55 }),
        ],
      },
      {
        id: "voice",
        name: "The tune",
        hint: "Short and high. Shout, do not sing.",
        family: "top",
        priority: 6,
        pattern: [
          hit(beat(3), "outer", { degree: 4 }),
          hit(beat(7), "center", { degree: 2 }),
        ],
      },
    ],
  },

  {
    id: "garba",
    name: "Garba",
    origin: "Gujarati folk · traditional",
    description: "A circle dance for hundreds. Starts easy, ends flat out.",
    bpm: 112,
    cycleBeats: 8,
    moodId: "monsoon",
    roles: [
      {
        id: "pulse",
        name: "Keep the beat",
        hint: "Steady and light. The dancers follow you.",
        family: "rhythm",
        priority: 1,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 0.95 }),
          hit(beat(2)), hit(beat(4)), hit(beat(6)),
        ],
      },
      {
        id: "claps",
        name: "Clap along",
        hint: "The taali. Everyone, together, on the same two beats.",
        family: "rhythm",
        priority: 2,
        pattern: [
          hit(beat(1), "outer", { anchor: true, velocity: 0.9 }),
          hit(beat(5), "outer", { anchor: true, velocity: 0.9 }),
        ],
      },
      {
        id: "ground",
        name: "The low boom",
        hint: "Under the turn of the circle.",
        family: "bass",
        priority: 3,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 1 }),
          hit(beat(3), "center"), hit(beat(6)),
        ],
      },
      {
        id: "answer",
        name: "In the gaps",
        hint: "Answer the claps, a beat behind them.",
        family: "rhythm",
        priority: 4,
        pattern: [hit(beat(2)), hit(beat(3)), hit(beat(6)), hit(beat(7))],
      },
      {
        id: "colour",
        name: "Fast and light",
        hint: "A quick rattle through everything.",
        family: "rhythm",
        priority: 6,
        pattern: [hit(2), hit(6), hit(10), hit(14), hit(18), hit(22), hit(26), hit(30)],
      },
      {
        id: "bed",
        name: "Long notes",
        hint: "Warm and open. Do not hurry.",
        family: "bed",
        priority: 5,
        pattern: [
          hit(beat(0), "sweep", { anchor: true, degree: 0, velocity: 0.6 }),
          hit(beat(4), "sweep", { degree: 2, velocity: 0.55 }),
        ],
      },
    ],
  },

  {
    id: "dholtasha",
    name: "Dhol Tasha",
    origin: "Maharashtrian processional · traditional",
    description: "Street procession. Enormous, relentless, built for crowds.",
    bpm: 118,
    cycleBeats: 8,
    moodId: "night",
    roles: [
      {
        id: "pulse",
        name: "Keep the beat",
        hint: "The tasha. Fast, tight, right on top of the beat.",
        family: "rhythm",
        priority: 1,
        // Eight strokes, grouped 3+3+2 over each half-cycle. A real tasha roll
        // is busier, but twelve hits is denser than one person is permitted to
        // play: the density cap allows eleven at five people and eight at
        // eight, and an arrangement does not get to overrule that.
        pattern: [
          hit(0, "outer", { anchor: true, velocity: 1 }),
          hit(3), hit(6), hit(10),
          hit(16), hit(19), hit(22), hit(26),
        ],
      },
      {
        id: "ground",
        name: "The low boom",
        hint: "The dhol. Huge and slow against all that speed.",
        family: "bass",
        priority: 2,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 1 }),
          hit(beat(2), "center"), hit(beat(4)), hit(beat(6), "center"),
        ],
      },
      {
        id: "answer",
        name: "In the gaps",
        hint: "Off the beat, pushing the procession forward.",
        family: "rhythm",
        priority: 3,
        pattern: [hit(2), hit(10), hit(18), hit(26)],
      },
      {
        id: "claps",
        name: "Clap along",
        hint: "One clap a cycle, all together. Save it for the turn.",
        family: "rhythm",
        priority: 4,
        pattern: [hit(beat(4), "outer", { anchor: true, velocity: 1 })],
      },
      {
        id: "bed",
        name: "Long notes",
        hint: "A low drone holding the whole street together.",
        family: "bed",
        priority: 5,
        pattern: [
          hit(beat(0), "sweep", { anchor: true, degree: 0, velocity: 0.6 }),
        ],
      },
    ],
  },

  {
    id: "kirtan",
    name: "Kirtan",
    origin: "Devotional · traditional",
    description: "Call and answer. Everyone sings back. Builds without trying.",
    bpm: 84,
    cycleBeats: 8,
    moodId: "monsoon",
    roles: [
      {
        id: "pulse",
        name: "Keep the beat",
        hint: "Gentle and even. Nothing to prove.",
        family: "rhythm",
        priority: 1,
        pattern: [
          hit(beat(0), "outer", { anchor: true, velocity: 0.85 }),
          hit(beat(2)), hit(beat(4)), hit(beat(6)),
        ],
      },
      {
        id: "ground",
        name: "The low boom",
        hint: "Once a cycle, low and warm.",
        family: "bass",
        priority: 2,
        pattern: [hit(beat(0), "outer", { anchor: true, velocity: 0.9 })],
      },
      {
        id: "call",
        name: "The call",
        hint: "You go first. The room answers you.",
        family: "top",
        priority: 3,
        pattern: [
          hit(beat(0), "outer", { anchor: true, degree: 0 }),
          hit(beat(1), "outer", { degree: 2 }),
          hit(beat(2), "outer", { degree: 4 }),
        ],
      },
      {
        id: "answer",
        name: "The answer",
        hint: "Wait for the call, then reply. Never at the same time.",
        family: "top",
        priority: 4,
        pattern: [
          hit(beat(4), "outer", { anchor: true, degree: 4 }),
          hit(beat(5), "outer", { degree: 2 }),
          hit(beat(6), "center", { degree: 0 }),
        ],
      },
      {
        id: "claps",
        name: "Clap along",
        hint: "Two claps a cycle, everyone at once.",
        family: "rhythm",
        priority: 5,
        pattern: [
          hit(beat(3), "outer", { anchor: true, velocity: 0.85 }),
          hit(beat(7), "outer", { anchor: true, velocity: 0.85 }),
        ],
      },
      {
        id: "bed",
        name: "Long notes",
        hint: "One held note, all the way through.",
        family: "bed",
        priority: 6,
        pattern: [
          hit(beat(0), "sweep", { anchor: true, degree: 0, velocity: 0.55 }),
        ],
      },
    ],
  },
] as const;

export function getSong(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}

export function getRole(song: Song, roleId: string): RoleDef | undefined {
  return song.roles.find((r) => r.id === roleId);
}
