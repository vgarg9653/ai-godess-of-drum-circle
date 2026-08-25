/**
 * The kit must actually be on disk.
 *
 * Every sound is a real recording now, which means a typo in a filename is
 * silence rather than a wrong note — and silence is very hard to notice in a
 * room already full of other people's drums.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INSTRUMENTS } from "@godc/shared";
import { allSampleUrls, filesFor, specFor, SOUND_BANK } from "@/engine/soundBank";

const PUBLIC = path.resolve(import.meta.dirname, "../../public");

describe("the essential kit", () => {
  it("has a sound for every instrument in the roster", () => {
    for (const instrument of INSTRUMENTS) {
      expect(
        SOUND_BANK[instrument.id],
        `${instrument.id} has no sound`,
      ).toBeDefined();
    }
  });

  it("has no sounds left over from instruments that were removed", () => {
    const ids = new Set(INSTRUMENTS.map((i) => i.id));
    for (const key of Object.keys(SOUND_BANK)) {
      expect(ids.has(key), `${key} has a sound but no instrument`).toBe(true);
    }
  });

  it("points only at files that exist", () => {
    for (const url of allSampleUrls()) {
      const file = path.join(PUBLIC, url.replace(/^\//, ""));
      expect(existsSync(file), `missing ${url}`).toBe(true);
    }
  });

  it("gives every stroke something to play", () => {
    for (const [id, spec] of Object.entries(SOUND_BANK)) {
      for (const stroke of ["outer", "center", "sweep"] as const) {
        const files = spec.strokes[stroke];
        expect(files, `${id}/${stroke} is empty`).toBeTruthy();
        if (Array.isArray(files)) expect(files.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the whole kit small enough to preload over venue wifi", () => {
    // Sixty phones pulling this at once over one access point is the real case.
    expect(allSampleUrls().length).toBeLessThanOrEqual(24);
  });

  it("round-robins the sounds that repeat fastest", () => {
    // Two takes of the same clap alternating reads as two hands; one file fired
    // twice reads as a machine gun.
    expect(filesFor(specFor("claps")).length).toBeGreaterThan(1);
  });
});
