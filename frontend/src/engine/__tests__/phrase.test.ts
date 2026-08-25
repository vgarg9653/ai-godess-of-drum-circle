import { describe, expect, it } from "vitest";
import {
  degreeForOnset,
  degreeToMidi,
  getMood,
  maxOnsets,
  quantizeToStep,
  STEPS_PER_BEAT,
  type Onset,
  type TransportState,
} from "@godc/shared";
import {
  applyTap,
  clearAll,
  clearStep,
  emptyPhrase,
  refit,
  seedFromId,
  sortedOnsets,
} from "../phrase";

const transport: TransportState = {
  bpm: 120,
  cycleBeats: 8,
  moodId: "monsoon",
  startedAt: 1_000_000,
  revision: 1,
};

/** At 120bpm a step is 125ms. */
const STEP_MS = (60 / transport.bpm / STEPS_PER_BEAT) * 1000;
const SEED = seedFromId("participant-a");

describe("quantizeToStep", () => {
  it("snaps a late touch back to the step the player meant", () => {
    // 40ms after step 4 — clearly aiming at step 4, not step 5.
    const late = (4 * STEP_MS + 40) / 1000;
    expect(quantizeToStep(late, transport.bpm, transport.cycleBeats)).toBe(4);
  });

  it("wraps around the cycle", () => {
    const steps = transport.cycleBeats * STEPS_PER_BEAT;
    const intoNextCycle = ((steps + 3) * STEP_MS) / 1000;
    expect(quantizeToStep(intoNextCycle, transport.bpm, transport.cycleBeats)).toBe(3);
  });
});

describe("applyTap", () => {
  it("places a touch on the quantized step", () => {
    const phrase = applyTap(
      emptyPhrase("djembe"),
      { atSharedMs: transport.startedAt + 2 * STEP_MS + 30, stroke: "outer" },
      transport,
      4,
      SEED,
    );
    expect(phrase.onsets).toHaveLength(1);
    expect(phrase.onsets[0].step).toBe(2);
    expect(phrase.onsets[0].stroke).toBe("outer");
    expect(phrase.revision).toBe(1);
  });

  it("replaces rather than layers when two touches hit the same step", () => {
    let phrase = emptyPhrase("djembe");
    phrase = applyTap(
      phrase,
      { atSharedMs: transport.startedAt + 2 * STEP_MS, stroke: "outer" },
      transport, 4, SEED,
    );
    phrase = applyTap(
      phrase,
      { atSharedMs: transport.startedAt + 2 * STEP_MS + 10, stroke: "center" },
      transport, 4, SEED,
    );
    expect(phrase.onsets).toHaveLength(1);
    expect(phrase.onsets[0].stroke).toBe("center");
  });

  it("never exceeds the density cap, evicting the oldest touch", () => {
    const count = 12;
    const cap = maxOnsets(count, transport.cycleBeats);
    let phrase = emptyPhrase("djembe");
    const totalSteps = transport.cycleBeats * STEPS_PER_BEAT;

    for (let step = 0; step < totalSteps; step++) {
      phrase = applyTap(
        phrase,
        { atSharedMs: transport.startedAt + step * STEP_MS, stroke: "outer" },
        transport, count, SEED,
      );
      expect(phrase.onsets.length).toBeLessThanOrEqual(cap);
    }
    expect(phrase.onsets).toHaveLength(cap);
    // The most recent touches survived.
    expect(phrase.onsets.at(-1)!.step).toBe(totalSteps - 1);
  });

  it("tightens the cap as the room grows", () => {
    expect(maxOnsets(4, 8)).toBeGreaterThan(maxOnsets(40, 8));
  });

  it("returns the new onset last, so it can be auditioned immediately", () => {
    // The play surface sounds the stroke the instant it lands, and finds it by
    // taking the last entry. Insertion order is load-bearing, not incidental.
    let phrase = emptyPhrase("djembe");
    for (const step of [6, 2, 9]) {
      phrase = applyTap(
        phrase,
        { atSharedMs: transport.startedAt + step * STEP_MS, stroke: "outer" },
        transport, 5, SEED,
      );
      expect(phrase.onsets.at(-1)!.step).toBe(step);
    }
  });

  it("puts the replacement last when a touch lands on an occupied step", () => {
    let phrase = emptyPhrase("djembe");
    phrase = applyTap(
      phrase,
      { atSharedMs: transport.startedAt + 4 * STEP_MS, stroke: "outer" },
      transport, 5, SEED,
    );
    phrase = applyTap(
      phrase,
      { atSharedMs: transport.startedAt + 8 * STEP_MS, stroke: "outer" },
      transport, 5, SEED,
    );
    phrase = applyTap(
      phrase,
      { atSharedMs: transport.startedAt + 4 * STEP_MS, stroke: "sweep" },
      transport, 5, SEED,
    );
    expect(phrase.onsets.at(-1)!.step).toBe(4);
    expect(phrase.onsets.at(-1)!.stroke).toBe("sweep");
    expect(phrase.onsets).toHaveLength(2);
  });

  it("assigns every onset a scale degree, since players never pick pitch", () => {
    const phrase = applyTap(
      emptyPhrase("sitar"),
      { atSharedMs: transport.startedAt + 5 * STEP_MS, stroke: "outer" },
      transport, 6, SEED,
    );
    expect(phrase.onsets[0].degree).toBeTypeOf("number");
  });
});

describe("degreeForOnset", () => {
  it("is stable for a given seed and step, so a loop does not re-pitch itself", () => {
    const a = degreeForOnset(SEED, 7);
    const b = degreeForOnset(SEED, 7);
    expect(a).toBe(b);
  });

  it("differs between participants on the same step", () => {
    const seeds = ["a", "b", "c", "d", "e", "f"].map(seedFromId);
    const degrees = new Set(seeds.map((s) => degreeForOnset(s, 4)));
    // Not a guarantee for any single pair, but six players should not collide
    // on one note — that would mean the hash is not spreading.
    expect(degrees.size).toBeGreaterThan(1);
  });

  it("stays inside the mood's scale", () => {
    const mood = getMood("night");
    for (let step = 0; step < 32; step++) {
      const degree = degreeForOnset(SEED, step);
      const midi = degreeToMidi(mood, degree);
      const semitone = ((midi - mood.rootMidi) % 12 + 12) % 12;
      expect(mood.scale).toContain(semitone);
    }
  });

  it("resolves home often enough to sound intentional", () => {
    let root = 0;
    for (let step = 0; step < 200; step++) {
      if (degreeForOnset(SEED, step) === 0) root++;
    }
    // Root is weighted at 2/(range*2) = 20% of the distribution.
    expect(root / 200).toBeGreaterThan(0.1);
  });
});

describe("clearStep / clearAll", () => {
  it("clears one step and bumps the revision", () => {
    let phrase = applyTap(
      emptyPhrase("tabla"),
      { atSharedMs: transport.startedAt, stroke: "outer" },
      transport, 4, SEED,
    );
    const before = phrase.revision;
    phrase = clearStep(phrase, 0);
    expect(phrase.onsets).toHaveLength(0);
    expect(phrase.revision).toBe(before + 1);
  });

  it("leaves the revision alone when nothing changed", () => {
    const phrase = emptyPhrase("tabla");
    expect(clearStep(phrase, 5).revision).toBe(phrase.revision);
    expect(clearAll(phrase).revision).toBe(phrase.revision);
  });
});

describe("refit", () => {
  it("wraps onsets instead of dropping them when the cycle shortens", () => {
    const onsets: Onset[] = [1, 5, 20, 30].map((step) => ({
      step, velocity: 0.8, stroke: "outer" as const, degree: 0,
    }));
    const refitted = refit({ ...emptyPhrase("kalimba"), onsets }, 16, 8, 4);
    const steps = refitted.onsets.map((o) => o.step);
    expect(Math.max(...steps)).toBeLessThan(8 * STEPS_PER_BEAT);
    expect(refitted.onsets.length).toBeGreaterThan(0);
  });
});

describe("sortedOnsets", () => {
  it("orders by step without disturbing the stored touch order", () => {
    const onsets: Onset[] = [9, 2, 5].map((step) => ({
      step, velocity: 0.8, stroke: "outer" as const, degree: 0,
    }));
    const phrase = { ...emptyPhrase("conga"), onsets };
    expect(sortedOnsets(phrase).map((o) => o.step)).toEqual([2, 5, 9]);
    expect(phrase.onsets.map((o) => o.step)).toEqual([9, 2, 5]);
  });
});
