/**
 * Guards on the roster itself.
 *
 * These are the rules that were broken by hand once already: two instruments
 * sharing an emblem, and four sustaining voices sitting in the same octave so
 * they blurred into one another. Both are invisible to the type system, so they
 * are checked here instead.
 */

import { describe, expect, it } from "vitest";
import {
  allocateInstrument,
  ICON_PATHS,
  iconPath,
  INSTRUMENTS,
  swapOptions,
  type Family,
} from "@godc/shared";

describe("instrument emblems", () => {
  it("gives every instrument its own emblem", () => {
    for (const instrument of INSTRUMENTS) {
      expect(ICON_PATHS[instrument.id], `${instrument.id} has no emblem`).toBeTypeOf(
        "string",
      );
    }
  });

  it("never repeats a path, so no two instruments look alike", () => {
    const seen = new Map<string, string>();
    for (const instrument of INSTRUMENTS) {
      const path = iconPath(instrument.id);
      const clash = seen.get(path);
      expect(clash, `${instrument.id} and ${clash} share an emblem`).toBeUndefined();
      seen.set(path, instrument.id);
    }
  });

  it("has no emblems left over from removed instruments", () => {
    const ids = new Set(INSTRUMENTS.map((i) => i.id));
    for (const key of Object.keys(ICON_PATHS)) {
      expect(ids.has(key), `${key} has an emblem but no instrument`).toBe(true);
    }
  });

  it("draws every emblem as an open stroke path", () => {
    for (const [id, path] of Object.entries(ICON_PATHS)) {
      expect(path.startsWith("M"), `${id} does not start with a move`).toBe(true);
    }
  });
});

describe("roster", () => {
  it("has unique ids", () => {
    const ids = INSTRUMENTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every family", () => {
    const families = new Set(INSTRUMENTS.map((i) => i.family));
    expect([...families].sort()).toEqual(["bass", "bed", "rhythm", "top"]);
  });

  it("spreads sustaining voices across registers, so they do not blur", () => {
    for (const family of ["bed", "top"] as Family[]) {
      const sustaining = INSTRUMENTS.filter((i) => i.family === family && i.sustains);
      const octaves = sustaining.map((i) => i.octave ?? 0);
      expect(new Set(octaves).size, `${family} sustains share a register`).toBe(
        octaves.length,
      );
    }
  });
});

describe("allocation", () => {
  it("never hands out an opt-in-only voice unprompted", () => {
    const taken: string[] = [];
    for (let i = 0; i < 40; i++) {
      const chosen = allocateInstrument(taken, "medium");
      expect(["birds", "beatbox"]).not.toContain(chosen.id);
      taken.push(chosen.id);
    }
  });

  it("keeps the room balanced rather than piling onto one family", () => {
    const taken: string[] = [];
    for (let i = 0; i < 20; i++) taken.push(allocateInstrument(taken, "medium").id);
    const rhythm = taken.filter(
      (id) => INSTRUMENTS.find((i) => i.id === id)?.family === "rhythm",
    ).length;
    // Target for a medium room is 45%; allow drift but not a takeover.
    expect(rhythm / taken.length).toBeGreaterThan(0.3);
    expect(rhythm / taken.length).toBeLessThan(0.6);
  });

  it("still offers every instrument in the swap sheet", () => {
    const options = swapOptions(["tabla", "sitar"], "medium", "tabla");
    expect(options).toHaveLength(INSTRUMENTS.length);
    expect(options[0].id).toBe("tabla");
  });
});
