/**
 * What each instrument is made of.
 *
 * Three kinds of voice:
 *
 *  - `players`  — unpitched percussion, one recorded one-shot per stroke.
 *                 No pitch-shifting: a transposed drum sounds like a transposed
 *                 drum, and these are all real recordings.
 *  - `sampler`  — pitched voices, a handful of recorded notes that Tone fills
 *                 between by transposing.
 *  - `synth`    — hand-built models, used only where no openly-licensed
 *                 recording exists. See docs/AUDIO_ASSETS.md for which and why.
 *
 * Files come from `node tools/fetch-samples.mjs`; sources and licences are in
 * tools/sample-sources.json and frontend/public/samples/CREDITS.md.
 */

import type { Stroke } from "@godc/shared";

/** Hand-built voices. Each is a real model, not a placeholder beep. */
export type SynthModel =
  | "tabla"
  | "dholak"
  | "ghatam"
  | "bayan"
  | "tanpura"
  | "beatbox";

export interface PlayersSpec {
  kind: "players";
  dir: string;
  /** Filename stem per stroke, under /samples/<dir>/. */
  strokes: Record<Stroke, string>;
  /** Level trim in dB, so families sit together. */
  trimDb?: number;
}

export interface SamplerSpec {
  kind: "sampler";
  dir: string;
  /** Note names matching the files on disk. Tone transposes between them. */
  notes: readonly string[];
  /** Fade-out applied when a note is released, in seconds. */
  release?: number;
  trimDb?: number;
}

export interface SynthSpec {
  kind: "synth";
  model: SynthModel;
  trimDb?: number;
}

export type SoundSpec = PlayersSpec | SamplerSpec | SynthSpec;

const strokes = (open: string, muted: string, accent: string): Record<Stroke, string> => ({
  outer: open,
  center: muted,
  sweep: accent,
});

/** Every file here is one that `fetch-samples.mjs` actually writes. */
export const SOUND_BANK: Record<string, SoundSpec> = {
  /* ---- recorded percussion (VCSL, CC0) --------------------------- */
  cajon:     { kind: "players", dir: "cajon",     strokes: strokes("open", "muted", "accent") },
  claps:     { kind: "players", dir: "claps",     strokes: strokes("open", "muted", "accent"), trimDb: -2 },
  claves:    { kind: "players", dir: "claves",    strokes: strokes("open", "muted", "accent"), trimDb: -4 },
  frameDrum: { kind: "players", dir: "frameDrum", strokes: strokes("open", "muted", "accent") },
  conga:     { kind: "players", dir: "conga",     strokes: strokes("open", "muted", "accent") },
  djembe:    { kind: "players", dir: "djembe",    strokes: strokes("open", "muted", "accent") },
  shaker:    { kind: "players", dir: "shaker",    strokes: strokes("open", "muted", "accent"), trimDb: -3 },
  kanjira:   { kind: "players", dir: "kanjira",   strokes: strokes("open", "muted", "accent"), trimDb: -2 },
  woodblock: { kind: "players", dir: "woodblock", strokes: strokes("open", "muted", "accent"), trimDb: -4 },
  manjira:   { kind: "players", dir: "manjira",   strokes: strokes("open", "muted", "accent"), trimDb: -6 },
  agogo:     { kind: "players", dir: "agogo",     strokes: strokes("open", "muted", "accent"), trimDb: -5 },

  /* ---- recorded pitched voices (FluidR3_GM, MIT) ----------------- */
  sitar:        { kind: "sampler", dir: "sitar",        notes: ["C3", "G3", "C4", "G4", "C5"], trimDb: -3 },
  shehnai:      { kind: "sampler", dir: "shehnai",      notes: ["C4", "G4", "C5", "G5"], release: 0.4, trimDb: -6 },
  bansuri:      { kind: "sampler", dir: "bansuri",      notes: ["C4", "G4", "C5", "G5"], release: 0.45, trimDb: -6 },
  santoor:      { kind: "sampler", dir: "santoor",      notes: ["C3", "G3", "C4", "G4", "C5"], trimDb: -4 },
  harmonium:    { kind: "sampler", dir: "harmonium",    notes: ["C2", "C3", "G3", "C4", "G4"], release: 0.5, trimDb: -7 },
  kalimba:      { kind: "sampler", dir: "kalimba",      notes: ["C4", "G4", "C5", "G5"], trimDb: -3 },
  marimba:      { kind: "sampler", dir: "marimba",      notes: ["C3", "C4", "G4", "C5"], trimDb: -4 },
  glockenspiel: { kind: "sampler", dir: "glockenspiel", notes: ["C5", "G5", "C6"], trimDb: -8 },
  koto:         { kind: "sampler", dir: "koto",         notes: ["C3", "G3", "C4", "G4"], trimDb: -4 },
  birds:        { kind: "sampler", dir: "birds",        notes: ["C5", "G5", "C6"], trimDb: -7 },
  bassPulse:    { kind: "sampler", dir: "bassPulse",    notes: ["C1", "G1", "C2", "G2"], release: 0.3, trimDb: -2 },
  taiko:        { kind: "sampler", dir: "taiko",        notes: ["C2", "G2", "C3"], trimDb: -4 },
  warmPad:      { kind: "sampler", dir: "warmPad",      notes: ["C3", "C4", "G4"], release: 1.8, trimDb: -10 },
  rhodes:       { kind: "sampler", dir: "rhodes",       notes: ["C2", "C3", "C4", "C5"], release: 0.25, trimDb: -6 },

  /* ---- hand-built, no open recording available ------------------- */
  tabla:   { kind: "synth", model: "tabla" },
  dholak:  { kind: "synth", model: "dholak" },
  ghatam:  { kind: "synth", model: "ghatam" },
  bayan:   { kind: "synth", model: "bayan", trimDb: -1 },
  tanpura: { kind: "synth", model: "tanpura", trimDb: -8 },
  beatbox: { kind: "synth", model: "beatbox", trimDb: -3 },
};

const FALLBACK: SynthSpec = { kind: "synth", model: "tabla" };

export function specFor(instrumentId: string): SoundSpec {
  return SOUND_BANK[instrumentId] ?? FALLBACK;
}

/** True when an instrument plays real recordings rather than a model. */
export function isSampled(instrumentId: string): boolean {
  return specFor(instrumentId).kind !== "synth";
}

/** Every audio file the roster needs, as URLs. Drives the preload gate. */
export function allSampleUrls(): string[] {
  const urls: string[] = [];
  for (const spec of Object.values(SOUND_BANK)) {
    if (spec.kind === "players") {
      for (const stem of Object.values(spec.strokes)) {
        urls.push(`/samples/${spec.dir}/${stem}.mp3`);
      }
    } else if (spec.kind === "sampler") {
      for (const note of spec.notes) {
        urls.push(`/samples/${spec.dir}/${note}.mp3`);
      }
    }
  }
  // Same file can appear twice if two instruments ever share a directory.
  return [...new Set(urls)];
}
