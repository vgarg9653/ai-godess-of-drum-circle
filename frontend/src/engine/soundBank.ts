/**
 * What each instrument is made of.
 *
 * Every sound in the room is a real recording, played at the pitch it was
 * captured. Nothing is synthesised and nothing is pitch-shifted.
 *
 * That is a deliberate narrowing. An earlier version had thirty-one
 * instruments drawn from soundfonts and hand-built models, and it sounded like
 * software — which for an app whose whole promise is "your phone becomes an
 * instrument" is fatal. Eleven real ones is worth more than thirty-one
 * approximations.
 *
 * The three tuned instruments (bass, guitar, sitar) are all in D, so they agree
 * with each other and with the room without anything being transposed.
 *
 * Files live in `frontend/public/essential-kit/`. See docs/AUDIO_ASSETS.md.
 */

import type { Stroke } from "@godc/shared";

/**
 * One or more files for a stroke.
 *
 * An array is round-robined, which matters for sounds that repeat quickly: two
 * takes of the same clap alternating reads as two hands, where one file fired
 * twice reads as a machine gun.
 */
export type StrokeFiles = string | readonly string[];

export interface SoundSpec {
  kind: "players";
  strokes: Record<Stroke, StrokeFiles>;
  /** Level trim in dB for the whole instrument. */
  trimDb?: number;
  /**
   * Per-file gain in dB, on top of `trimDb`.
   *
   * `tools/level-kit.mjs` matches the files themselves, but it will not boost a
   * short percussive sound past its own peak — squashing a drum attack through a
   * limiter to win a few dB is a bad trade. A handful of files therefore stay
   * quieter than the rest, and are lifted here instead, where the master limiter
   * is downstream and can catch anything that gets close.
   */
  gains?: Record<string, number>;
}

/** Everything is served from here. Flat, because the kit is small. */
export const KIT_BASE = "/essential-kit/";

export const SOUND_BANK: Record<string, SoundSpec> = {
  /* ---- Beat ---------------------------------------------------- */
  tabla: {
    kind: "players",
    // a = low resonant (dha), b = bright ringing (na).
    strokes: { outer: "tabla_a", center: "tabla_b", sweep: "tabla_b" },
    // The bright `na` came in 8dB under everything else. Lifted, but not all the
    // way: on a real tabla `na` genuinely is the quieter stroke.
    gains: { tabla_b: 6 },
  },
  dholak: {
    kind: "players",
    strokes: { outer: "dholak_a", center: "dholak_b", sweep: "dholak_a" },
  },
  claps: {
    kind: "players",
    // Two real takes, alternated. Two hands, not one sample repeated.
    strokes: {
      outer: ["claps_a", "claps_b"],
      center: ["claps_b", "claps_a"],
      sweep: ["claps_a", "claps_b"],
    },
  },
  stomp: {
    kind: "players",
    strokes: { outer: "stomp_a", center: "stomp_a", sweep: "stomp_a" },
  },
  shaker: {
    kind: "players",
    // a = tight tick, b = loose wash.
    strokes: { outer: "shaker_a", center: "shaker_b", sweep: "shaker_b" },
    gains: { shaker_a: 4, shaker_b: 2 },
  },
  kartal: {
    kind: "players",
    strokes: { outer: "kartal_a", center: "kartal_a", sweep: "kartal_a" },
    gains: { kartal_a: 3 },
  },
  manjira: {
    kind: "players",
    strokes: { outer: "manjira_a", center: "manjira_a", sweep: "manjira_a" },
  },

  /* ---- Deep ---------------------------------------------------- */
  dhol: {
    kind: "players",
    strokes: { outer: "dhol_deep_a", center: "dhol_deep_a", sweep: "dhol_deep_a" },
  },
  bass: {
    kind: "players",
    // a = D (root), b = A (fifth). Both already in the room's key.
    strokes: { outer: "bass_a", center: "bass_b", sweep: "bass_a" },
  },

  /* ---- Background ---------------------------------------------- */
  guitar: {
    kind: "players",
    strokes: { outer: "guitar_a", center: "guitar_a", sweep: "guitar_a" },
  },

  /* ---- Melody -------------------------------------------------- */
  sitar: {
    kind: "players",
    // a = D major, b = D minor. Both agree with the drone; neither is wrong.
    strokes: { outer: "sitar_a", center: "sitar_b", sweep: "sitar_a" },
  },
};

const FALLBACK: SoundSpec = {
  kind: "players",
  strokes: { outer: "tabla_a", center: "tabla_b", sweep: "tabla_b" },
};

export function specFor(instrumentId: string): SoundSpec {
  return SOUND_BANK[instrumentId] ?? FALLBACK;
}

/** Every file a spec references, deduplicated. */
export function filesFor(spec: SoundSpec): string[] {
  const out = new Set<string>();
  for (const files of Object.values(spec.strokes)) {
    for (const file of typeof files === "string" ? [files] : files) out.add(file);
  }
  return [...out];
}

/** Every audio file the roster needs, as URLs. Drives the preload gate. */
export function allSampleUrls(): string[] {
  const urls = new Set<string>();
  for (const spec of Object.values(SOUND_BANK)) {
    for (const file of filesFor(spec)) urls.add(`${KIT_BASE}${file}.mp3`);
  }
  return [...urls];
}
