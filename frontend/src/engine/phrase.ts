/**
 * Phrase editing.
 *
 * Pure functions over a Phrase, so the rules that make the app impossible to
 * fail — snapped timing, chosen pitch, capped density — are testable without an
 * AudioContext.
 */

import {
  degreeForOnset,
  gridSteps,
  maxOnsets,
  quantizeToStep,
  type Onset,
  type Phrase,
  type Stroke,
  type TransportState,
} from "@godc/shared";

export function emptyPhrase(instrumentId: string): Phrase {
  return { instrumentId, onsets: [], revision: 0 };
}

export interface TapInput {
  /** Shared-clock time of the touch, in ms. */
  atSharedMs: number;
  stroke: Stroke;
  velocity?: number;
  /** Sustained voices hold for longer than one step. */
  durSteps?: number;
}

/**
 * Fold a touch into the phrase.
 *
 * Timing is snapped to the grid on the way in, and the pitch is chosen for the
 * player by `degreeForOnset`. Between them there is no way to be wrong: you
 * pick a moment and a stroke, and the room handles the rest.
 *
 * When the phrase is already at its density cap the oldest onset is evicted
 * rather than the new touch being dropped. Silently ignoring input reads as a
 * broken screen; hearing your stroke replace an older one reads as the
 * instrument having a memory, which is what it actually has.
 */
export function applyTap(
  phrase: Phrase,
  input: TapInput,
  transport: TransportState,
  participantCount: number,
  /** Stable per participant, so two people on one instrument differ. */
  pitchSeed: number,
): Phrase {
  const step = quantizeToStep(
    (input.atSharedMs - transport.startedAt) / 1000,
    transport.bpm,
    transport.cycleBeats,
  );

  const onset: Onset = {
    step,
    velocity: input.velocity ?? 0.85,
    stroke: input.stroke,
    degree: degreeForOnset(pitchSeed, step),
    ...(input.durSteps !== undefined ? { durSteps: input.durSteps } : {}),
  };

  // One onset per step per participant: two touches that quantize to the same
  // step are the same musical event, and layering them just doubles the volume.
  const withoutSameStep = phrase.onsets.filter((o) => o.step !== step);
  const next = [...withoutSameStep, onset];

  const cap = maxOnsets(participantCount, transport.cycleBeats);
  // Onsets are held in touch order, not step order, so "drop the oldest" means
  // the stroke the player laid down longest ago. Sorting happens at display time.
  const trimmed = next.length > cap ? next.slice(next.length - cap) : next;

  return { ...phrase, onsets: trimmed, revision: phrase.revision + 1 };
}

/** Step-ordered copy, for drawing the loop. Playback does not care about order. */
export function sortedOnsets(phrase: Phrase): Onset[] {
  return [...phrase.onsets].sort((a, b) => a.step - b.step);
}

/** Remove whatever sits on a step. */
export function clearStep(phrase: Phrase, step: number): Phrase {
  const onsets = phrase.onsets.filter((o) => o.step !== step);
  if (onsets.length === phrase.onsets.length) return phrase;
  return { ...phrase, onsets, revision: phrase.revision + 1 };
}

export function clearAll(phrase: Phrase): Phrase {
  if (phrase.onsets.length === 0) return phrase;
  return { ...phrase, onsets: [], revision: phrase.revision + 1 };
}

/**
 * Re-fit a phrase after the host changes the cycle length.
 *
 * Onsets past the new end are wrapped rather than discarded, so shortening the
 * cycle folds someone's phrase instead of deleting their contribution.
 */
export function refit(
  phrase: Phrase,
  fromCycleBeats: number,
  toCycleBeats: number,
  participantCount: number,
): Phrase {
  if (fromCycleBeats === toCycleBeats) return phrase;
  const toSteps = gridSteps(toCycleBeats);

  const seen = new Set<number>();
  const wrapped: Onset[] = [];
  for (const onset of phrase.onsets) {
    const step = onset.step % toSteps;
    if (seen.has(step)) continue;
    seen.add(step);
    wrapped.push({ ...onset, step });
  }

  const cap = maxOnsets(participantCount, toCycleBeats);
  // Keep the most recent touches, matching applyTap's eviction rule.
  const trimmed = wrapped.length > cap ? wrapped.slice(wrapped.length - cap) : wrapped;
  return { ...phrase, onsets: trimmed, revision: phrase.revision + 1 };
}

/** How full the phrase is against its current cap, 0..1. */
export function densityRatio(
  phrase: Phrase,
  participantCount: number,
  cycleBeats: number,
): number {
  const cap = maxOnsets(participantCount, cycleBeats);
  return cap === 0 ? 0 : Math.min(1, phrase.onsets.length / cap);
}

/** Stable pitch seed from a participant id, so it survives reconnects. */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
