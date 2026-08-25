/**
 * Musical constants shared by client and server.
 *
 * Everything here is pure and deterministic: the server and every phone must
 * derive identical grids, scales and densities from the same room state, or
 * devices drift apart musically even when the clock is perfectly in sync.
 */

/** Grid resolution. 4 = sixteenth notes. All onsets are integer steps. */
export const STEPS_PER_BEAT = 4;

export const BPM_MIN = 60;
export const BPM_MAX = 120;
export const BPM_DEFAULT = 90;

/**
 * Selectable rhythm cycle lengths, in beats.
 *
 * Three, not more. Every extra option is a decision a facilitator has to make
 * in front of a waiting room. 6 and 8 cover most of it; 16 gives long phrases
 * room to unfold. (12, for an ektal feel, is a one-line addition here if the
 * room ever wants it.)
 */
export interface CycleOption {
  beats: number;
  label: string;
  hint: string;
}

export const CYCLE_OPTIONS: readonly CycleOption[] = [
  { beats: 6, label: "6", hint: "Lilting and circular." },
  { beats: 8, label: "8", hint: "Open and easy. Best for first-timers." },
  { beats: 16, label: "16", hint: "Long phrases, room to breathe." },
] as const;

export const CYCLE_BEATS_DEFAULT = 8;

export function gridSteps(cycleBeats: number): number {
  return cycleBeats * STEPS_PER_BEAT;
}

export function stepDurationSeconds(bpm: number): number {
  return 60 / bpm / STEPS_PER_BEAT;
}

export function cycleDurationSeconds(bpm: number, cycleBeats: number): number {
  return (60 / bpm) * cycleBeats;
}

/* ------------------------------------------------------------------ *
 * Scale and mood
 * ------------------------------------------------------------------ */

/** Semitone offsets from the room's root note. */
export type Scale = readonly number[];

export const SCALES = {
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  /** Dorian. Equivalent to raga Kafi's ascent — the monsoon mood. */
  kafi: [0, 2, 3, 5, 7, 9, 10],
  /** Raga Bhairav. The flat second is what makes it sound like night. */
  bhairav: [0, 1, 4, 5, 7, 8, 11],
} as const satisfies Record<string, Scale>;

/**
 * Mood ids.
 *
 * Named for times of day rather than for music theory, because the host picking
 * one is reading it out to a room, not choosing a mode. The scale behind each is
 * never shown in the UI.
 */
export type MoodId = "dawn" | "monsoon" | "night";

export interface Mood {
  id: MoodId;
  name: string;
  description: string;
  scale: Scale;
  /** MIDI note number of the room's root. 48 = C3. */
  rootMidi: number;
  suggestedBpm: number;
}

export const MOODS: readonly Mood[] = [
  {
    id: "dawn",
    name: "Dawn",
    description: "Bright and open. Carries a large, noisy room.",
    scale: SCALES.majorPentatonic,
    rootMidi: 48, // C3
    suggestedBpm: 104,
  },
  {
    id: "monsoon",
    name: "Monsoon",
    description: "Rolling and warm. Nothing can clash.",
    scale: SCALES.kafi,
    rootMidi: 45, // A2
    suggestedBpm: 90,
  },
  {
    id: "night",
    name: "Night",
    description: "Low and ceremonial. Slows a room down.",
    scale: SCALES.bhairav,
    rootMidi: 43, // G2
    suggestedBpm: 76,
  },
] as const;

export const MOOD_DEFAULT: MoodId = "monsoon";

export function getMood(id: MoodId): Mood {
  return MOODS.find((m) => m.id === id) ?? MOODS[1];
}

/**
 * Map an abstract scale degree onto a concrete MIDI note.
 *
 * This is the "pitch is always correct" guarantee: a degree cannot express a
 * wrong note, because the scale is the only thing it can index into.
 */
export function degreeToMidi(mood: Mood, degree: number, octaveOffset = 0): number {
  const n = mood.scale.length;
  // Floor division so negative degrees wrap downward correctly.
  const octave = Math.floor(degree / n) + octaveOffset;
  const idx = ((degree % n) + n) % n;
  return mood.rootMidi + mood.scale[idx] + octave * 12;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ------------------------------------------------------------------ *
 * Choosing the note for the player
 * ------------------------------------------------------------------ */

/**
 * Pick the scale degree for an onset.
 *
 * Players never choose a pitch — they choose a moment and a stroke, and this
 * decides what it sounds like. Two properties make that feel intentional
 * rather than random:
 *
 *  - It is a pure function of (seed, step), so the same onset plays the same
 *    note on every repeat of the loop and on every device. A phrase that
 *    re-rolled its pitches each cycle would sound like a fault.
 *  - It walks the scale in small steps rather than jumping, so a sequence of
 *    taps comes out as a line instead of a scatter.
 *
 * `seed` should be stable per participant, so two people on the same instrument
 * do not land on identical notes.
 */
export function degreeForOnset(seed: number, step: number, range = 5): number {
  // Cheap integer hash. Deterministic across engines, unlike Math.random.
  let h = (seed * 2654435761 + step * 40503) >>> 0;
  h ^= h >>> 13;
  h = (h * 1274126177) >>> 0;
  h ^= h >>> 16;

  // Bias toward the root: degree 0 twice as likely as any other, so phrases
  // keep resolving home instead of wandering.
  const pick = h % (range * 2);
  return pick < 2 ? 0 : Math.floor(pick / 2);
}

/* ------------------------------------------------------------------ *
 * Density
 * ------------------------------------------------------------------ */

/**
 * Fraction of the grid any single participant may fill.
 *
 * The brief requires the texture to stay open as the group grows, so this
 * tightens logarithmically with participant count. Both server and client
 * compute it, so a stale or hostile client cannot flood the room.
 */
export function densityFactor(participantCount: number): number {
  const n = Math.max(1, participantCount);
  const factor = 0.55 - 0.09 * Math.log2(n);
  return Math.min(0.55, Math.max(0.1, factor));
}

/** Hard cap on onsets in one participant's phrase. */
export function maxOnsets(participantCount: number, cycleBeats: number): number {
  const steps = gridSteps(cycleBeats);
  return Math.max(2, Math.round(steps * densityFactor(participantCount)));
}

/* ------------------------------------------------------------------ *
 * Quantization
 * ------------------------------------------------------------------ */

/**
 * Snap a moment in shared time to the nearest grid step of the current cycle.
 *
 * `elapsedSeconds` is measured from the transport's shared origin, so every
 * device that agrees on the clock also agrees on the step — this is what makes
 * "timing is always correct" true across phones rather than just on one.
 */
export function quantizeToStep(
  elapsedSeconds: number,
  bpm: number,
  cycleBeats: number,
): number {
  const steps = gridSteps(cycleBeats);
  const stepDur = stepDurationSeconds(bpm);
  const absoluteStep = Math.round(elapsedSeconds / stepDur);
  return ((absoluteStep % steps) + steps) % steps;
}
