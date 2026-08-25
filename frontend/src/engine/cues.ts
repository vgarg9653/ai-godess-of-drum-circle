/**
 * Cues, and letting go of them.
 *
 * A person cued into a song part is shown *when*, and nothing else. These rules
 * decide when each of their hits stops being shown.
 *
 * Two ways out, and deliberately no way to tell them apart:
 *
 *  - **Found it.** A hit tapped near enough on two separate cycles releases.
 *  - **Time.** Everything remaining releases after a set number of cycles.
 *
 * Because a cue *fades* rather than switching off, both feel the same from the
 * inside — "the cues went away as I got it". Nobody, including the player,
 * can tell which happened. That is what keeps this non-comparative, and why
 * there is no way to fail.
 *
 * Pure, so the rules can be tested without an AudioContext or a room.
 */

/** One hit of this person's part, and whether its cue has let go. */
export interface Cue {
  step: number;
  /** Cycles in which this hit was found. Never shown, never sent anywhere. */
  found: number;
  released: boolean;
}

/** How close a tap must land to count as finding a hit. */
export const CUE_WINDOW_STEPS = 1.5;
/** Cycles a hit must be found in before its cue lets go. */
export const CUE_HITS_TO_RELEASE = 2;
/** Cycles after which every remaining cue fades, found or not. */
export const CUE_MAX_CYCLES = 8;
/** Spread of the fallback across people, so a room does not all come free at once. */
export const CUE_STAGGER_CYCLES = 3;

export function makeCues(steps: readonly number[]): Cue[] {
  return [...steps].sort((a, b) => a - b).map((step) => ({ step, found: 0, released: false }));
}

/**
 * How many hits are being taught at once.
 *
 * One. This is the Simon Says lesson: a person learns a sequence by being shown
 * one thing at a time, not the whole pattern at once. Their loop is playing
 * their *entire* part from the first bar regardless — the room never hears a
 * partial arrangement — but only one hit is ever being *asked for*.
 *
 * "Tap on this one" is a thing a stranger holding an unfamiliar drum can do.
 * "Play this four-hit syncopated figure" is not.
 */
export const CUE_TEACH_AT_ONCE = 1;

/**
 * The hit currently being asked for.
 *
 * Earliest un-released hit, so the lesson walks through the part in the order it
 * sounds. Empty once everything has been released.
 */
export function activeCues(cues: readonly Cue[]): Cue[] {
  return cues.filter((c) => !c.released).slice(0, CUE_TEACH_AT_ONCE);
}

/**
 * Distance between two steps, the short way round the cycle.
 *
 * A tap a hair before beat one is early for beat one, not a whole bar late for
 * it — which is exactly when a nervous player taps.
 */
export function cycleDistance(a: number, b: number, steps: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, steps - raw);
}

/**
 * Note a tap against the cues.
 *
 * Credits every un-released hit within the window, which matters for dense
 * parts where two hits sit a step apart: the player meant one of them, and
 * guessing which would be worse than crediting both.
 */
export function registerTap(cues: readonly Cue[], step: number, steps: number): Cue[] {
  // Only the hit being taught can be credited. Otherwise a person tapping
  // steadily would quietly satisfy hits nobody had shown them yet, and the
  // lesson would skip ahead of what they had actually learned.
  const active = new Set(activeCues(cues).map((c) => c.step));
  return cues.map((cue) =>
    active.has(cue.step) && cycleDistance(cue.step, step, steps) <= CUE_WINDOW_STEPS
      ? { ...cue, found: cue.found + 1 }
      : cue,
  );
}

/**
 * Let go of what has been found, and of everything once the clock runs out.
 * Called on the bar line.
 *
 * @param cyclesElapsed cycles since this person was cued
 * @param stagger 0..CUE_STAGGER_CYCLES-1, stable per person
 */
export function advanceCues(
  cues: readonly Cue[],
  cyclesElapsed: number,
  stagger: number,
): { cues: Cue[]; allReleased: boolean } {
  const outOfTime = cyclesElapsed >= CUE_MAX_CYCLES + stagger;
  const next = cues.map((cue) =>
    cue.released || outOfTime || cue.found >= CUE_HITS_TO_RELEASE
      ? { ...cue, released: true }
      : cue,
  );
  return { cues: next, allReleased: next.every((c) => c.released) };
}

/** Stable 0..CUE_STAGGER_CYCLES-1 offset, so one person's wait never wobbles. */
export function staggerFor(seed: number): number {
  return seed % CUE_STAGGER_CYCLES;
}
