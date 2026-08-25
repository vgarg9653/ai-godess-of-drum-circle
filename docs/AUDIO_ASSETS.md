# Audio assets

## What the room plays

**Eleven instruments, every one a real recording**, played at the pitch it was
captured. Nothing is synthesised and nothing is pitch-shifted.

| Beat | Deep | Background | Melody |
| --- | --- | --- | --- |
| Tabla, Dholak, Hand Claps, Stomp, Shaker, Kartal, Manjira | Dhol, Bass | Guitar | Sitar |

Files are in `frontend/public/essential-kit/`, flat, mono MP3, silence-trimmed
and level-matched. About 240KB for the whole kit — which is a quarter of what it
replaced, and preloads in a blink over venue wifi.

The three tuned instruments — bass, guitar, sitar — are all **in D**, so they
agree with each other and with the room without anything being transposed.
`sitar_a` is a D major chord, `sitar_b` D minor; both fit, so neither can be
wrong.

## Why the roster shrank from 31 to 11

The previous set drew on the VCSL and FluidR3_GM libraries: correctly licensed,
broad, and — as soon as anyone actually listened to it in a room — obviously
*software*. Soundfont renderings of a tabla or a bansuri read as MIDI, not as
instruments. For an app whose entire promise is "your phone becomes an
instrument", that is fatal.

**Eleven real ones beat thirty-one approximations.** Everything that could not
be sourced as a true recording was removed rather than faked, including some
instruments that had been asked for. Adding more is purely a matter of finding
more real audio.

Dropped, and worth restoring if real recordings turn up: ghatam, kanjira,
djembe, conga, frame drum, claves, woodblock, agogo, bayan, taiko, tanpura,
harmonium, warm pad / voices, rhodes, bansuri, shehnai, santoor, kalimba,
marimba, glockenspiel, koto, birdsong, beatbox.

## The licensing problem, stated plainly

The kit comes from [tidalcycles/Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples).
That repository **ships no LICENSE file and states no terms.** Its contents were
contributed from many sources over many years. In the absence of a stated
licence the default is all rights reserved, per sample, by whoever holds it.

Using them privately — a retreat, a workshop, testing — is a very different
thing from redistributing them. **This repository is public**, so the audio is
deliberately git-ignored: it stays on the machines that have it, and is not
published from here. The app runs normally either way.

This is not legal advice. If any of this is ever charged for, get someone to
look at it properly.

### Putting it right

Three options, roughly in order of effort:

1. **Re-source equivalents under clear terms.** Freesound filtered to CC0 is the
   obvious place; VCSL (CC0) already covers a lot of percussion honestly. Slot
   them into the same filenames and nothing else changes.
2. **Keep the repo private** until that is done.
3. **Clear the samples** with whoever holds them.

The previous pipeline is still here and still works — `tools/sample-sources.json`
and `tools/fetch-samples.mjs` fetch and convert the CC0/MIT set from scratch.
Nothing in the roster points at it now, but it is the shortest path back to
audio that can be published, and its licence texts remain in `licenses/`.

## Getting the kit onto another machine

Because the audio is not in the repo, a fresh clone has no sound until the files
are copied into `frontend/public/essential-kit/`. `KIT.md` in that folder lists
exactly what belongs there and what each file is.

`frontend/src/__tests__/kit.test.ts` fails loudly if any file the app asks for is
missing — a typo in a filename is silence, and silence is very hard to notice in
a room already full of other people's drums.

## Latency

`AudioEngine.auditionOnset` schedules a tap with `Tone.immediate()`, **not**
`Tone.now()`. They are not the same thing: `now()` returns
`currentTime + context.lookAhead`, and Tone's default lookAhead is 100ms, which
put every tap a tenth of a second behind the finger. The sequencer still uses
`now()`, where lookahead is exactly what you want. A struck note must not.

If latency still feels high on a device, `Tone.getContext().lookAhead` is the
next dial — but lowering it globally trades scheduling reliability for
responsiveness, so measure before turning it.
