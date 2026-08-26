/**
 * The layered start.
 *
 * Watching real rooms: when a jam begins, either nobody dares start, or
 * everyone starts at once and the first minute is mud. A human facilitator
 * fixes this by bringing people in one at a time — "you start… now you…" —
 * and that is exactly what this reproduces.
 *
 * After Begin, the room opens in stages. One person (small rooms) or one
 * family of instruments (large rooms) is invited in per stage; everyone else
 * is told whose moment it is and can practise QUIETLY — their taps sound
 * softly on their own phone, and their groove holds back from joining the
 * room until their stage arrives. Entrances therefore land on stage
 * boundaries, which is to say: musically.
 *
 * Everything here is a pure function of the participant list and the cycle
 * count, both of which every device already agrees on (join order is shared
 * state; cycles derive from the shared clock). No wire protocol, no server —
 * sixty phones compute the same stages independently.
 *
 * Nobody is ever blocked or scored. A hesitant person's stage simply passes,
 * and they can join whenever they find it — the gate only holds BEFORE your
 * stage, never after.
 */

import { FAMILY_LABEL, getInstrument, type Family, type Participant } from "@godc/shared";

/** Cycles each stage lasts. Two bars to plant your feet. */
export const STAGE_CYCLES = 2;
/** Rooms up to this size are brought in person by person; bigger ones by family. */
export const SOLO_THRESHOLD = 8;
/** How loudly you hear your own practice taps while waiting your turn. */
export const PRACTICE_GAIN = 0.35;

export interface Stage {
  /** Participant ids invited in at this stage. */
  ids: string[];
  /** What the rest of the room is told: a name, or "the drums". */
  label: string;
}

export type LayerStatus =
  | { phase: "waiting"; stageLabel: string; yourStageIn: number }
  | { phase: "yourTurn" }
  | { phase: "joined"; stageLabel: string }
  | { phase: "open" };

/** The stage plan for a room, derived from join order. */
export function stagesFor(participants: readonly Participant[]): Stage[] {
  if (participants.length <= 1) return [];
  if (participants.length <= SOLO_THRESHOLD) {
    return participants.map((p) => ({ ids: [p.id], label: p.name }));
  }
  // Large rooms come in as sections, lowest first — the way bands build.
  const order: Family[] = ["bass", "rhythm", "bed", "top"];
  const stages: Stage[] = [];
  for (const family of order) {
    const ids = participants
      .filter((p) => {
        const instrument = p.instrumentId ? getInstrument(p.instrumentId) : undefined;
        return instrument?.family === family;
      })
      .map((p) => p.id);
    if (ids.length > 0) stages.push({ ids, label: `the ${FAMILY_LABEL[family]}` });
  }
  return stages;
}

/**
 * Where one person stands, a given number of cycles after Begin.
 *
 * `open` means the layering is over (or was never needed) and the room is a
 * free jam.
 */
export function layerStatus(
  participants: readonly Participant[],
  youId: string,
  cyclesSinceBegin: number,
): LayerStatus {
  const stages = stagesFor(participants);
  if (stages.length <= 1) return { phase: "open" };

  const current = Math.floor(cyclesSinceBegin / STAGE_CYCLES);
  if (current >= stages.length) return { phase: "open" };

  const mine = stages.findIndex((s) => s.ids.includes(youId));
  // Not in the plan (joined mid-layering): free to play, never held back.
  if (mine === -1) return { phase: "open" };

  if (current < mine) {
    return {
      phase: "waiting",
      stageLabel: stages[current].label,
      yourStageIn: (mine - current) * STAGE_CYCLES - (cyclesSinceBegin % STAGE_CYCLES),
    };
  }
  if (current === mine) return { phase: "yourTurn" };
  return { phase: "joined", stageLabel: stages[current].label };
}

/** May this person's groove lock and join the room yet? */
export function mayLock(status: LayerStatus): boolean {
  return status.phase !== "waiting";
}
