#!/usr/bin/env node
/**
 * Fetch and prepare the instrument sample set.
 *
 *   node tools/fetch-samples.mjs           # fetch anything missing
 *   node tools/fetch-samples.mjs --force   # re-fetch everything
 *
 * Requires ffmpeg on PATH. Sources and licences live in tools/sample-sources.json;
 * output lands in frontend/public/samples/ and is git-ignored, so every clone runs
 * this once rather than the repo carrying binaries.
 *
 * Two deliberate choices in here:
 *
 *  - Percussion one-shots are peak-normalised individually, because they are
 *    unrelated recordings and need to sit at a comparable level.
 *  - Pitched notes are NOT normalised. They come from one instrument and their
 *    relative loudness across the register is musical information; flattening it
 *    makes a sampler sound synthetic.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const exec = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "frontend/public/samples");
const STAGE = path.join(tmpdir(), "godc-samples");
const FORCE = process.argv.includes("--force");
const CONCURRENCY = 6;

/** MP3 bitrates. Mono throughout — this comes out of one phone speaker. */
const BITRATE_PERC = "96k";
const BITRATE_PITCHED = "112k";

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function download(url, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  // -f so a 404 fails loudly instead of writing an HTML error page as audio.
  await exec("curl", ["-fsSL", "--retry", "3", "--max-time", "120", "-o", dest, url]);
}

/** Peak level in dB, via ffmpeg's volumedetect. Returns 0 when undetectable. */
async function peakDb(file) {
  try {
    const { stderr } = await exec("ffmpeg", ["-i", file, "-af", "volumedetect", "-f", "null", "-"]);
    const m = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
    return m ? parseFloat(m[1]) : 0;
  } catch {
    return 0;
  }
}

async function encode(src, dest, { normalise, bitrate }) {
  await mkdir(path.dirname(dest), { recursive: true });
  // Trim leading silence: any lead-in reads as latency and undoes quantization.
  const filters = ["silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0"];
  // Trim the tail too. VCSL one-shots carry seconds of near-digital silence
  // after the sound has gone, which is pure payload. Reversing, trimming the
  // (now leading) silence and reversing back is the standard way to do it.
  // -62dB only catches true silence, so natural room decay survives; the short
  // fade-out then prevents a click at the new end.
  // While reversed, a fade-IN is a fade-OUT on the original — which avoids
  // needing to know the trimmed duration up front to place a fade-out.
  filters.push(
    "areverse",
    "silenceremove=start_periods=1:start_threshold=-62dB:start_silence=0.02",
    "afade=t=in:st=0:d=0.012",
    "areverse",
  );
  if (normalise) {
    const peak = await peakDb(src);
    // Leave 1dB of headroom so the limiter downstream has somewhere to work.
    const gain = -peak - 1;
    if (Math.abs(gain) > 0.2) filters.push(`volume=${gain.toFixed(2)}dB`);
  }
  await exec("ffmpeg", [
    "-y", "-loglevel", "error", "-i", src,
    "-af", filters.join(","),
    "-ac", "1", "-ar", "44100", "-b:a", bitrate,
    dest,
  ]);
}

async function pool(items, worker) {
  const queue = [...items];
  const results = [];
  const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        results.push({ ok: true, item, value: await worker(item) });
      } catch (err) {
        results.push({ ok: false, item, err: err.message?.slice(0, 200) });
      }
    }
  });
  await Promise.all(runners);
  return results;
}

const manifest = JSON.parse(await readFile(path.join(ROOT, "tools/sample-sources.json"), "utf8"));
const jobs = [];

for (const [inst, spec] of Object.entries(manifest.percussion)) {
  for (const [key, rel] of Object.entries(spec.files)) {
    jobs.push({
      kind: "perc", inst, key,
      url: manifest.sources.VCSL.base + rel.split("/").map(encodeURIComponent).join("/"),
      stage: path.join(STAGE, inst, `${key}${path.extname(rel)}`),
      dest: path.join(OUT, inst, `${key}.mp3`),
      normalise: true, bitrate: BITRATE_PERC,
    });
  }
}

for (const [inst, spec] of Object.entries(manifest.pitched)) {
  for (const note of spec.notes) {
    jobs.push({
      kind: "pitched", inst, key: note,
      url: `${manifest.sources.FluidR3_GM.base}${spec.gm}-mp3/${note}.mp3`,
      stage: path.join(STAGE, inst, `${note}.src.mp3`),
      dest: path.join(OUT, inst, `${note}.mp3`),
      normalise: false, bitrate: BITRATE_PITCHED,
    });
  }
}

const todo = FORCE ? jobs : (await Promise.all(jobs.map(async (j) => (await exists(j.dest)) ? null : j))).filter(Boolean);
console.log(`${jobs.length} samples in manifest, ${todo.length} to fetch.`);

const results = await pool(todo, async (job) => {
  await download(job.url, job.stage);
  await encode(job.stage, job.dest, job);
  const { size } = await stat(job.dest);
  return size;
});

const failed = results.filter((r) => !r.ok);
for (const f of failed) console.error(`  FAIL ${f.item.inst}/${f.item.key}: ${f.err}`);

// Credits are generated, never hand-maintained, so they cannot drift from reality.
const lines = [
  "# Sample credits",
  "",
  "Generated by `node tools/fetch-samples.mjs`. Do not edit by hand.",
  "",
  "## Sources",
  "",
];
for (const [name, src] of Object.entries(manifest.sources)) {
  lines.push(`### ${name} — ${src.license}`, "", `<${src.url}>`, "", src.note, "");
}
lines.push("## Instruments", "", "| Instrument | Source | Licence |", "| --- | --- | --- |");
for (const [inst, spec] of Object.entries(manifest.percussion)) {
  lines.push(`| \`${inst}\` | ${spec.credit} | CC0-1.0 |`);
}
for (const [inst, spec] of Object.entries(manifest.pitched)) {
  lines.push(`| \`${inst}\` | ${spec.credit} | MIT |`);
}
lines.push("");
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, "CREDITS.md"), lines.join("\n"));

await rm(STAGE, { recursive: true, force: true });

const bytes = results.filter((r) => r.ok).reduce((n, r) => n + r.value, 0);
console.log(`Done. ${results.length - failed.length} written, ${failed.length} failed, ${(bytes / 1024).toFixed(0)}KB new.`);
if (failed.length) process.exitCode = 1;
