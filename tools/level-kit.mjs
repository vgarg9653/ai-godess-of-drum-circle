#!/usr/bin/env node
/**
 * Level the essential kit so no instrument shouts over another.
 *
 *   node tools/level-kit.mjs            # report only
 *   node tools/level-kit.mjs --apply    # rewrite the files
 *
 * The kit arrived peak-normalised, which is not the same as loudness-matched:
 * peaks all sat near 0dB while perceived level ranged over 25dB. In a room
 * where one person has the stomp and another has the tabla's bright stroke,
 * that means one of them is inaudible and the other is deafening. Two of the
 * claps were also over 0 dBFS, which is audible distortion rather than volume.
 *
 * Uses mean volume as the loudness proxy rather than EBU R128. loudnorm needs
 * roughly three seconds of material to gate properly and most of this kit is
 * under one, so it silently declines to measure exactly the files that most
 * need it. Mean volume is cruder but works at every length, which matters more.
 *
 * Gain is clamped so nothing is pushed past the ceiling — quiet percussive
 * transients cannot be boosted without a limiter, and squashing a drum attack
 * to win 3dB is a bad trade. A little residual spread is fine, and sometimes
 * correct: a tabla's `na` really is quieter than its `dha`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);
const KIT = path.resolve(import.meta.dirname, "../frontend/public/essential-kit");
const APPLY = process.argv.includes("--apply");

/** Perceived level everything aims for. */
const TARGET_MEAN_DB = -18;
/** Nothing may peak above this. Leaves the limiter downstream some room. */
const CEILING_DB = -1.5;

async function measure(file) {
  const { stderr } = await exec("ffmpeg", ["-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  const mean = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const peak = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
  return {
    mean: mean ? parseFloat(mean[1]) : null,
    peak: peak ? parseFloat(peak[1]) : null,
  };
}

const files = (await readdir(KIT)).filter((f) => f.endsWith(".mp3")).sort();
const plan = [];

for (const name of files) {
  const file = path.join(KIT, name);
  const { mean, peak } = await measure(file);
  if (mean === null || peak === null) {
    plan.push({ name, skip: "could not measure" });
    continue;
  }
  const wanted = TARGET_MEAN_DB - mean;
  const headroom = CEILING_DB - peak;
  const gain = Math.min(wanted, headroom);
  plan.push({ name, mean, peak, wanted, gain, clamped: wanted > headroom });
}

console.log(
  `${"file".padEnd(16)}${"mean".padStart(8)}${"peak".padStart(8)}${"gain".padStart(8)}`,
);
for (const row of plan) {
  if (row.skip) {
    console.log(`${row.name.padEnd(16)}  ${row.skip}`);
    continue;
  }
  const note = row.clamped ? "  (clamped by peak)" : row.peak > 0 ? "  (was clipping)" : "";
  console.log(
    row.name.padEnd(16) +
      row.mean.toFixed(1).padStart(8) +
      row.peak.toFixed(1).padStart(8) +
      `${row.gain >= 0 ? "+" : ""}${row.gain.toFixed(1)}`.padStart(8) +
      note,
  );
}

if (!APPLY) {
  console.log("\nReport only. Re-run with --apply to rewrite the files.");
  process.exit(0);
}

let changed = 0;
for (const row of plan) {
  if (row.skip || Math.abs(row.gain) < 0.25) continue;
  const file = path.join(KIT, row.name);
  const tmp = path.join(KIT, `.${row.name}.tmp.mp3`);
  await exec("ffmpeg", [
    "-y", "-loglevel", "error", "-i", file,
    "-af", `volume=${row.gain.toFixed(2)}dB`,
    "-ac", "1", "-ar", "44100", "-b:a", "128k",
    tmp,
  ]);
  await unlink(file);
  await rename(tmp, file);
  changed += 1;
}
console.log(`\nRewrote ${changed} of ${files.length} files.`);
