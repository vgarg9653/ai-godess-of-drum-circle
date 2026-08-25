/**
 * Phrase validation.
 *
 * The client already enforces all of this for feel; the server enforces it
 * because one stale or hostile phone must not be able to flood a room of
 * sixty. Reject the whole phrase rather than repairing it — a phrase silently
 * "fixed" server-side no longer matches what the player sees on their own
 * screen, which is worse than an error.
 */

import {
  getInstrument,
  gridSteps,
  maxOnsets,
  type Phrase,
  type ProtocolError,
  type Room,
} from "@godc/shared";

const STROKES = new Set(["outer", "center", "sweep"]);

/** Returns null when the phrase is acceptable. */
export function validatePhrase(phrase: Phrase, room: Room): ProtocolError | null {
  const fail = (message: string): ProtocolError => ({
    code: "INVALID_PHRASE",
    message,
  });

  if (typeof phrase !== "object" || phrase === null) return fail("Not a phrase.");
  if (!getInstrument(phrase.instrumentId)) return fail("Unknown instrument.");
  if (!Number.isInteger(phrase.revision) || phrase.revision < 0) {
    return fail("Bad revision.");
  }
  if (!Array.isArray(phrase.onsets)) return fail("Onsets must be a list.");

  const steps = gridSteps(room.transport.cycleBeats);
  const cap = maxOnsets(room.participants.length, room.transport.cycleBeats);
  if (phrase.onsets.length > cap) {
    return fail(`Too dense: ${phrase.onsets.length} onsets against a cap of ${cap}.`);
  }

  const seen = new Set<number>();
  for (const onset of phrase.onsets) {
    if (typeof onset !== "object" || onset === null) return fail("Bad onset.");
    if (!Number.isInteger(onset.step) || onset.step < 0 || onset.step >= steps) {
      return fail(`Step ${onset.step} is off the grid.`);
    }
    if (seen.has(onset.step)) return fail(`Two onsets on step ${onset.step}.`);
    seen.add(onset.step);
    if (
      typeof onset.velocity !== "number" ||
      !Number.isFinite(onset.velocity) ||
      onset.velocity < 0 ||
      onset.velocity > 1
    ) {
      return fail("Velocity out of range.");
    }
    if (!STROKES.has(onset.stroke)) return fail("Unknown stroke.");
    if (
      onset.degree !== undefined &&
      (!Number.isInteger(onset.degree) || Math.abs(onset.degree) > 24)
    ) {
      return fail("Degree out of range.");
    }
    if (
      onset.durSteps !== undefined &&
      (!Number.isInteger(onset.durSteps) || onset.durSteps < 1 || onset.durSteps > steps)
    ) {
      return fail("Duration out of range.");
    }
  }
  return null;
}

/**
 * A sliding-window rate limiter for phrase updates.
 *
 * Generous — a human reworking a groove cannot hit this — but a runaway client
 * in a loop can, and sixty phones times a runaway is a bad evening.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs = 1000,
  ) {}

  /** True when this event is allowed. */
  allow(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length >= this.maxPerWindow) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  forget(key: string): void {
    this.hits.delete(key);
  }
}
