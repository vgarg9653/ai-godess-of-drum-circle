# Audio assets

## Where the sound comes from

**25 of the 31 instruments play real recordings.** The remaining six are
hand-built models, because no openly-licensed recording of them could be found.

Run this once after cloning:

```bash
node tools/fetch-samples.mjs        # needs ffmpeg on PATH
```

It downloads 88 files, converts them, and writes
`frontend/public/samples/` plus a generated `CREDITS.md`. Sources and licences
are declared in [`tools/sample-sources.json`](../tools/sample-sources.json).

Total payload: **~2.0 MB**, well inside the budget for sixty phones preloading
over one venue access point.

## The two sources

| Source | Licence | Used for |
| --- | --- | --- |
| [VCSL](https://github.com/sgossner/VCSL) — Versilian Community Sample Library | **CC0-1.0** | All unpitched percussion |
| [FluidR3_GM](https://github.com/gleitz/midi-js-soundfonts) via gleitz/midi-js-soundfonts | **MIT** | All pitched voices |

Both are public-domain or permissively licensed with no attribution
requirement and no non-commercial clause. `CREDITS.md` is generated from the
manifest anyway, so the record cannot drift from what is actually shipped.

### Why not Freesound or archive.org

Both were checked. Freesound's API requires OAuth for downloads, so it cannot be
scripted into a reproducible fetch. archive.org has excellent Indian classical
material, but the recordings are **CC BY-NC** — non-commercial only, which rules
them out for anything that might ever charge for a retreat.

## Notably good matches

Some of these are better than "close enough":

- **Harmonium → FluidR3 Reed Organ.** A harmonium *is* a reed organ. Same
  mechanism, same timbre.
- **Santoor → FluidR3 Dulcimer.** A santoor is a hammered dulcimer.
- **Sitar → FluidR3 Sitar.** An actual sitar, buzz and all.
- **Shehnai → FluidR3 Shanai.** Same instrument, alternate transliteration.
- **Manjira → VCSL Nepalese Hand Bells.** Small paired hand cymbals; right
  family, right ring.
- **Birdsong → FluidR3 Bird Tweet.** Real recorded birds.
- **Hand Claps → VCSL Claps.** Real hands.

## Honest substitutions

These are stand-ins. They sound good, but they are not the named instrument:

| Instrument | Actually playing | Why it works |
| --- | --- | --- |
| Djembe | VCSL Darbuka | Goblet drum, same bass/tone/slap vocabulary |
| Kanjira | VCSL Tambourine | Frame drum with jingles — the defining feature |
| Bansuri | FluidR3 Pan Flute | Breathy bamboo edge-blown tone |

## The six modelled voices

No open recording was findable for these, so they are synthesised in
[`frontend/src/engine/voices.ts`](../frontend/src/engine/voices.ts):

**Tabla, Dholak, Ghatam, Bayan, Tanpura** — the Indian core, and the honest gap
in this set. Each is a real model rather than a placeholder beep: the tabla sums
harmonic partials at near-integer ratios (a tabla is famously *harmonic*, unlike
almost every other drum), the bayan bends pitch the way a heel does, the tanpura
runs detuned sawtooth pairs to approximate the jawari shimmer. **A tabla player
will still hear the difference immediately.** Real recordings of these five are
the single biggest available upgrade to how this app sounds.

**Beatbox** — the exception. Mouth percussion is a synthesised sound by nature;
kick, snare and hi-hat modelled directly is not a compromise here.

## Adding real recordings

Change one entry in [`soundBank.ts`](../frontend/src/engine/soundBank.ts) from
`kind: "synth"` to a sampled kind, and add the files.

**Unpitched percussion** — three one-shots, one per stroke:

```ts
tabla: {
  kind: "players",
  dir: "tabla",
  strokes: { outer: "na", center: "te", sweep: "ge" },
},
```

Files go in `frontend/public/samples/tabla/{na,te,ge}.mp3`.

**Pitched voices** — a handful of notes; Tone transposes between them:

```ts
tanpura: { kind: "sampler", dir: "tanpura", notes: ["C2", "G2", "C3"], release: 2.0 },
```

To make it reproducible for everyone else, add the source to
`tools/sample-sources.json` rather than dropping files in by hand — the fetch
script and `CREDITS.md` both read from it.

## Format and processing

The fetch script does this automatically:

- **Mono, 44.1kHz, MP3** at 96kbps (percussion) / 112kbps (pitched). This comes
  out of one phone speaker; stereo is wasted bytes.
- **Leading silence trimmed.** Any lead-in reads as latency and undoes the
  quantization that makes the app impossible to play wrong.
- **Trailing silence trimmed** at −62dB, with a 12ms fade so the new end does
  not click. This alone cut the set from 2.9MB to 2.0MB — VCSL one-shots carry
  seconds of digital silence after the sound has gone.
- **Percussion peak-normalised** individually, since they are unrelated
  recordings that need to sit at a comparable level.
- **Pitched notes deliberately NOT normalised.** They come from one instrument,
  and their relative loudness across the register is musical information.
  Flattening it makes a sampler sound synthetic.

## The preload gate

[`engine/preload.ts`](../frontend/src/engine/preload.ts) decodes the whole
roster before anyone reaches the instrument screen, so the session survives a
dead connection and swapping instruments mid-session never touches the network.
Failures are collected rather than thrown: one missing file costs the room one
instrument, not the session.
