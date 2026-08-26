/**
 * Song arrangements.
 *
 * A song here is a set of musical decisions — tempo, metre, groove — plus
 * roles, each carrying a rhythmic pattern and the instrument that plays it.
 * Nothing of any recording is played back, and the kit is structurally
 * incapable of reproducing a melody: the bass has two pitches, the sitar two
 * chords, the guitar one. What a room recognises is the *groove*, and grooves
 * are exactly what a crowd of hands can hold.
 *
 * In song mode instruments are LOCKED: the arrangement dictates who plays
 * what, the way a bandleader hands out parts. `RoleDef.instruments` is dealt
 * round-robin to the people in the role, and there is no swap screen.
 *
 * `weight` sets the ratio as the room grows: every role gets one person first
 * (priority order), then people even out proportionally to weight — so a
 * stomp-and-clap song stays mostly stomps and claps at sixty people.
 *
 * Authoring rules, enforced by eval:
 *  - 5–7 roles; distinct priorities; ≤ the density cap at 8 people
 *  - every instrument id must exist in the roster
 *  - the two highest-priority roles carry anchors
 */

import type { Family } from "./instruments.js";
import type { MoodId } from "./music.js";
import type { Stroke } from "./protocol.js";

export interface PatternHit {
  step: number;
  stroke: Stroke;
  /** 0..1. Defaults to 0.85 when omitted. */
  velocity?: number;
  /** Scale degree, kept for future pitched kits. The current kit ignores it. */
  degree?: number;
  /**
   * Everyone in this role plays this hit rather than it being shared out.
   * Reserved for the hits that hold the cycle together.
   */
  anchor?: boolean;
}

export interface RoleDef {
  id: string;
  /** Shown to the player. Plain language, never music theory. */
  name: string;
  /** One line on what this part does in the piece. */
  hint: string;
  /** Which family this role belongs to, for the closing weave. */
  family: Family;
  /** Fill order when there are fewer people than roles. */
  priority: number;
  /** Share of the room once every role is filled. Default 1. */
  weight?: number;
  /**
   * The instruments this role hands out, round-robin by position in the role.
   * Locked — in song mode nobody chooses.
   */
  instruments: string[];
  pattern: PatternHit[];
}

export interface Song {
  id: string;
  name: string;
  /** Where the groove comes from. Shown quietly under the name. */
  origin: string;
  /** What it feels like to be in. Never theory. */
  description: string;
  bpm: number;
  cycleBeats: number;
  moodId: MoodId;
  rootMidi?: number;
  roles: RoleDef[];
}

const hit = (
  step: number,
  stroke: Stroke = "outer",
  extra: Omit<PatternHit, "step" | "stroke"> = {},
): PatternHit => ({ step, stroke, ...extra });

/** Beat `b` of the cycle, on the 16th-note grid. */
const beat = (b: number): number => b * 4;

export const SONGS: readonly Song[] = [
  {
    id: "rockYou",
    name: "We Will Rock You",
    origin: "Queen · the stomp-stomp-clap",
    description: "Two stomps, one clap. The whole world knows this one.",
    bpm: 81,
    cycleBeats: 8,
    moodId: "night",
    roles: [
      {
        id: "stomp",
        name: "Stomp",
        hint: "Two stomps, then wait for the clap. Boom, boom.",
        family: "rhythm",
        priority: 1,
        weight: 3,
        instruments: ["stomp"],
        pattern: [
          hit(0, "outer", { anchor: true, velocity: 1 }),
          hit(2, "outer", { anchor: true, velocity: 0.95 }),
          hit(beat(4), "outer", { velocity: 1 }),
          hit(18, "outer", { velocity: 0.95 }),
        ],
      },
      {
        id: "clap",
        name: "Clap",
        hint: "One clap, everyone together, right after the stomps.",
        family: "rhythm",
        priority: 2,
        weight: 3,
        instruments: ["claps"],
        // All anchored: the unison clap IS the song.
        pattern: [
          hit(beat(1), "outer", { anchor: true, velocity: 1 }),
          hit(beat(5), "outer", { anchor: true, velocity: 1 }),
        ],
      },
      {
        id: "deep",
        name: "The big drum",
        hint: "Land with the first stomp. Make the floor move.",
        family: "bass",
        priority: 3,
        instruments: ["dhol"],
        pattern: [
          hit(0, "outer", { anchor: true, velocity: 1 }),
          hit(beat(4), "outer", { velocity: 0.9 }),
        ],
      },
      {
        id: "drive",
        name: "Keep it rolling",
        hint: "A dry tick between the stomps.",
        family: "rhythm",
        priority: 4,
        instruments: ["kartal", "tabla"],
        pattern: [hit(beat(2)), hit(beat(3), "center"), hit(beat(6)), hit(beat(7), "center")],
      },
      {
        id: "chord",
        name: "The chord",
        hint: "One big strum at the top. Let it ring the whole way.",
        family: "bed",
        priority: 5,
        instruments: ["guitar"],
        pattern: [hit(0, "outer", { anchor: true, velocity: 0.8 })],
      },
    ],
  },

  {
    id: "chaiyya",
    name: "Chaiyya Chaiyya",
    origin: "Dil Se · the train-top dholak",
    description: "The groove that never sits down. Everything pushes forward.",
    bpm: 96,
    cycleBeats: 8,
    moodId: "monsoon",
    roles: [
      {
        id: "dholak",
        name: "The dholak",
        hint: "The engine of the song. Steady, rolling, unstoppable.",
        family: "rhythm",
        priority: 1,
        weight: 2,
        instruments: ["dholak", "tabla"],
        pattern: [
          hit(0, "outer", { anchor: true, velocity: 0.95 }),
          hit(6, "center"), hit(beat(2)), hit(beat(3), "center"),
          hit(beat(4)), hit(22, "center"), hit(beat(6)), hit(beat(7), "center"),
        ],
      },
      {
        id: "deep",
        name: "The big drum",
        hint: "Under it all, twice a cycle.",
        family: "bass",
        priority: 2,
        instruments: ["dhol"],
        pattern: [
          hit(0, "outer", { anchor: true, velocity: 1 }),
          hit(beat(4), "center", { velocity: 0.85 }),
        ],
      },
      {
        id: "clap",
        name: "Clap",
        hint: "Everyone claps the same two beats. Like the crowd on the train.",
        family: "rhythm",
        priority: 3,
        weight: 2,
        instruments: ["claps"],
        pattern: [
          hit(beat(2), "outer", { anchor: true, velocity: 0.9 }),
          hit(beat(6), "outer", { anchor: true, velocity: 0.9 }),
        ],
      },
      {
        id: "shimmer",
        name: "The shimmer",
        hint: "A fine rattle over the top. Light hands.",
        family: "rhythm",
        priority: 4,
        instruments: ["shaker", "manjira"],
        pattern: [hit(2), hit(10), hit(14), hit(18), hit(26), hit(30)],
      },
      {
        id: "strings",
        name: "The strings",
        hint: "A bright chord where the voice would breathe.",
        family: "top",
        priority: 5,
        instruments: ["sitar"],
        pattern: [hit(beat(3), "outer", { velocity: 0.75 }), hit(beat(7), "center", { velocity: 0.7 })],
      },
      {
        id: "ground",
        name: "The low note",
        hint: "Root, then the answer. Twice around.",
        family: "bass",
        priority: 6,
        instruments: ["bass"],
        pattern: [hit(0, "outer", { anchor: true, velocity: 0.85 }), hit(beat(4), "center", { velocity: 0.8 })],
      },
    ],
  },

  {
    id: "joBhiMain",
    name: "Jo Bhi Main",
    origin: "Rockstar · slow-burn strum",
    description: "Starts quiet, means it. Room to breathe between every hit.",
    bpm: 76,
    cycleBeats: 8,
    moodId: "night",
    roles: [
      {
        id: "strum",
        name: "The guitar",
        hint: "The heartbeat strum. Everything else leans on you.",
        family: "bed",
        priority: 1,
        weight: 2,
        instruments: ["guitar"],
        pattern: [
          hit(0, "outer", { anchor: true, velocity: 0.85 }),
          hit(beat(2), "outer", { velocity: 0.7 }),
          hit(beat(4), "outer", { velocity: 0.8 }),
          hit(beat(6), "outer", { velocity: 0.7 }),
        ],
      },
      {
        id: "pulse",
        name: "The soft drum",
        hint: "Gentle. Fingers, not palms.",
        family: "rhythm",
        priority: 2,
        instruments: ["tabla", "dholak"],
        pattern: [
          hit(0, "center", { anchor: true, velocity: 0.75 }),
          hit(beat(2), "center", { velocity: 0.65 }),
          hit(beat(4), "outer", { velocity: 0.8 }),
          hit(beat(6), "center", { velocity: 0.65 }),
        ],
      },
      {
        id: "ground",
        name: "The low note",
        hint: "Once a cycle, then let it fade all the way.",
        family: "bass",
        priority: 3,
        instruments: ["bass"],
        pattern: [hit(0, "outer", { anchor: true, velocity: 0.85 })],
      },
      {
        id: "minor",
        name: "The dark chord",
        hint: "The sad colour of the song. Halfway round, every time.",
        family: "top",
        priority: 4,
        instruments: ["sitar"],
        // Centre stroke = the D minor recording. The song's whole mood.
        pattern: [hit(beat(4), "center", { anchor: true, velocity: 0.75 })],
      },
      {
        id: "ring",
        name: "The small bell",
        hint: "One ring, high and far away.",
        family: "rhythm",
        priority: 5,
        instruments: ["manjira"],
        pattern: [hit(beat(6), "outer", { velocity: 0.6 })],
      },
    ],
  },

  {
    id: "standByMe",
    name: "Stand By Me",
    origin: "Ben E. King · that bassline feel",
    description: "Root and answer, walking forever. Warm and unhurried.",
    bpm: 118,
    cycleBeats: 8,
    moodId: "dawn",
    roles: [
      {
        id: "bassline",
        name: "The bass",
        hint: "Low note, then the answer. The song lives in your hands.",
        family: "bass",
        priority: 1,
        weight: 2,
        instruments: ["bass"],
        pattern: [
          hit(0, "outer", { anchor: true, velocity: 0.9 }),
          hit(6, "outer", { velocity: 0.75 }),
          hit(beat(3), "center", { velocity: 0.85 }),
          hit(beat(4), "outer", { velocity: 0.9 }),
          hit(22, "outer", { velocity: 0.75 }),
          hit(beat(7), "center", { velocity: 0.85 }),
        ],
      },
      {
        id: "click",
        name: "The click",
        hint: "Two dry clicks a cycle, exactly where you expect them.",
        family: "rhythm",
        priority: 2,
        instruments: ["kartal", "claps"],
        pattern: [
          hit(beat(2), "outer", { anchor: true, velocity: 0.85 }),
          hit(beat(6), "outer", { anchor: true, velocity: 0.85 }),
        ],
      },
      {
        id: "brush",
        name: "The brush",
        hint: "A soft steady swish underneath.",
        family: "rhythm",
        priority: 3,
        weight: 2,
        instruments: ["shaker"],
        pattern: [hit(0, "center"), hit(beat(1)), hit(beat(2), "center"), hit(beat(3)), hit(beat(4), "center"), hit(beat(5)), hit(beat(6), "center"), hit(beat(7))],
      },
      {
        id: "pulse",
        name: "The soft drum",
        hint: "Small and round, on the backbeat.",
        family: "rhythm",
        priority: 4,
        instruments: ["tabla", "dholak"],
        pattern: [hit(beat(1), "center"), hit(beat(3)), hit(beat(5), "center"), hit(beat(7))],
      },
      {
        id: "chord",
        name: "The chord",
        hint: "Bright strum at the turn of the cycle.",
        family: "bed",
        priority: 5,
        instruments: ["guitar"],
        pattern: [hit(0, "outer", { anchor: true, velocity: 0.7 }), hit(beat(4), "outer", { velocity: 0.65 })],
      },
    ],
  },

  {
    id: "kunFayaKun",
    name: "Kun Faya Kun",
    origin: "Rockstar · the qawwali sway",
    description: "Six beats, swaying. It carries you rather than you carrying it.",
    bpm: 76,
    cycleBeats: 6,
    moodId: "monsoon",
    roles: [
      {
        id: "sway",
        name: "The sway",
        hint: "Rock with it — strong, soft-soft, strong.",
        family: "rhythm",
        priority: 1,
        weight: 2,
        instruments: ["dholak", "tabla"],
        pattern: [
          hit(0, "outer", { anchor: true, velocity: 0.9 }),
          hit(6, "center"), hit(10, "center"),
          hit(beat(3), "outer", { velocity: 0.85 }),
          hit(18, "center"), hit(22, "center"),
        ],
      },
      {
        id: "ring",
        name: "The bell",
        hint: "One ring at the top of every sway. The qawwali's heartbeat.",
        family: "rhythm",
        priority: 2,
        instruments: ["manjira"],
        pattern: [hit(0, "outer", { anchor: true, velocity: 0.75 }), hit(beat(3), "outer", { velocity: 0.6 })],
      },
      {
        id: "drone",
        name: "The drone",
        hint: "The held chord underneath everything. Never hurry it.",
        family: "top",
        priority: 3,
        instruments: ["sitar"],
        pattern: [hit(0, "outer", { anchor: true, velocity: 0.7 })],
      },
      {
        id: "ground",
        name: "The low note",
        hint: "Once around, deep and warm.",
        family: "bass",
        priority: 4,
        instruments: ["bass"],
        pattern: [hit(0, "outer", { anchor: true, velocity: 0.8 })],
      },
      {
        id: "clap",
        name: "Clap",
        hint: "The qawwali clap — everyone, on the same beat.",
        family: "rhythm",
        priority: 5,
        weight: 2,
        instruments: ["claps"],
        pattern: [hit(beat(3), "outer", { anchor: true, velocity: 0.85 })],
      },
      {
        id: "strum",
        name: "The guitar",
        hint: "A gentle strum on the turn.",
        family: "bed",
        priority: 6,
        instruments: ["guitar"],
        pattern: [hit(beat(3), "outer", { velocity: 0.6 })],
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
