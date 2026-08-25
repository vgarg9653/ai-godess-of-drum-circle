# CLAUDE.md

Guidance for Claude Code when working in this repository.

## This repo is a variant

It began as a copy of
[goddess-of-drum-circle](https://github.com/vgarg9653/goddess-of-drum-circle),
which someone else is building a backend for. **This one has its own backend and
is free to diverge** — the protocol, the instrument roster and the musical model
are all fair game here.

So the usual warning is inverted: normally `shared/` must not drift, because the
server and every client have to compute identical answers. That still holds
*within this repo*. It no longer holds between the two repos, and it is not a
bug when `shared/` here stops matching upstream.

The one thing to keep straight: if a change is a genuine fix rather than a
divergence — a real bug in the clock, the density formula, the allocator — it
belongs upstream too. Carry it across rather than letting the same bug live on
in two places.

## Staying in touch with upstream

The original is wired up as the `upstream` remote.

```bash
git fetch upstream

# What has happened over there since we forked?
git log --oneline HEAD..upstream/main

# How far has the shared contract actually drifted?
git diff upstream/main -- shared/

# Take one specific fix
git cherry-pick <sha>

# Send a fix the other way (you own both repos)
git push upstream HEAD:fix/some-shared-bug
```

Do not `git merge upstream/main` casually once the two have genuinely diverged —
it will drag their protocol changes in wholesale and quietly undo intentional
differences here. Cherry-pick the commit you actually want.

## What this is

**Goddess of Drum Circle** — a collaborative musical instrument for a group of
people who are physically together in one room. Everyone opens the same link,
each phone becomes an instrument, and tapped phrases loop against a beat and key
shared across every device.

Two source documents, both in the repo root:

- `GOD-C Game Intro and Features.docx` — the requirements. Read before changing
  behaviour. It ends mid-sentence in *Presence*; see **Open questions**.
- `frontend/Prototype HTML Design Claude Interface.html` — the visual reference.
  A bundled Claude Design canvas. Its 8 screens are the design this app
  implements. To read it, decode the `data-dc-script` block and the gzipped
  module manifest inside; it is not human-readable as shipped.

### The constraint that explains the architecture

**Participants are in the same room, so audio is never streamed between
devices.** Each phone plays only its own phrase, out of its own speaker, and the
mix happens acoustically in the air.

This is not an optimisation, it is the design. It means:

- Phrases travel over the wire as tiny JSON structures, purely so other phones
  can *draw* them.
- What must be synchronised is **time**, not audio. Hence the shared-clock work.
- `AudioEngine.monitorOthers` exists only so one laptop can hear a whole room
  while developing. It must stay off in a real session.

### Nobody in the room speaks music

The hardest constraint in this project, and the easiest to break by accident.
The people using this are at a wedding, a retreat or a college fest. They have
never held a djembe and do not know what a cycle, a downbeat, a taal or 112bpm
is. Every word that reaches them has to work for someone who knows none of it.

In practice:

- **No units, no counts, no theory in the UI.** Not "112 bpm · 8" but "fast".
  Not "16 beats" but nothing at all. If a number is not actionable, cut it.
- **Lead with the feeling, not the name.** An instrument tile says "deep and
  round" first and "Djembe" second. The feeling is information to everybody; the
  name is information only to people who already knew.
- **Group things in words the room already uses.** Instruments browse by
  Thaap / Dhamaka / Jhankaar / Lehar / Sur / Masti — with Devanagari, which most
  of this audience reads faster than a transliteration. `Family` stays as the
  musical machinery underneath; `Browse` is what a person sees.
- **Name songs for the occasion, not the form.** "Baraat", "Garba Night",
  "Ganpati". The taal is small print. "Teental" means nothing to most of the
  room; "Sufi Night" means something instantly.
- **The instruction is a picture, not a sentence.** See the Simon Says note
  below.

When in doubt, read the string out loud and ask whether an uncle at a wedding
would know what it meant.

### The three guarantees

Every design decision serves one of these:

1. **Timing is always correct** — input snaps to a grid derived from a clock
   every device agrees on.
2. **Pitch is always correct** — the player never picks a note. `degreeForOnset`
   chooses one from the room's scale, deterministically per (participant, step).
3. **Nobody is ranked** — no counts, no comparison, no leaderboard, anywhere.
   Participants who stop playing are shown as *present*, never absent or
   inactive. The closing weave aggregates by family, never by person.

Treat all three as hard product constraints, not stylistic preferences.

## Stack

Vite 7 · React 18 · TypeScript · Tailwind v4 · Tone.js · Zustand · React Router 7 ·
Socket.IO · Vitest. npm workspaces monorepo, Node ≥ 20.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` (repo root) |
| **Fetch samples** | `node tools/fetch-samples.mjs` — **needs ffmpeg**, run once after clone |
| Dev server | `npm run dev` → http://localhost:5173 |
| Room server | `npm run dev:backend` → :3000 (`npm start` = production boot) |
| Build | `npm run build` |
| Typecheck | `npm run typecheck` |
| Test | `npm test` |
| Single test file | `cd frontend && npx vitest run src/engine/__tests__/phrase.test.ts` |

The app runs fully without a backend. `VITE_SERVER_URL` unset → in-browser mock
(`frontend/src/net/mockClient.ts`). Set it in `frontend/.env.local` to use the
real server (`npm run dev:backend`). Deploying: `docs/DEPLOY.md`.

## Layout

```
tools/
  sample-sources.json   Sample manifest: URLs, licences, credits
  fetch-samples.mjs     Download + ffmpeg pipeline. Idempotent; --force to redo
shared/src/
  music.ts        Grid, scales, moods, quantization, degreeForOnset, density
  instruments.ts  31 instruments + deterministic allocation + swap ordering
  icons.ts        SVG path data, drawn as <path> in DOM and Path2D on canvas
  protocol.ts     Socket.IO event contract. THE contract — backend imports this
frontend/src/
  engine/         Audio. No React in here, ever
    clock.ts        Cristian's-algorithm offset estimation
    AudioEngine.ts  Transport sync, loop scheduling, drift correction
    voices.ts       Players / Sampler / six hand-built models
    soundBank.ts    What each instrument is made of
    preload.ts      The loading gate
    phrase.ts       Pure phrase editing (quantize, density cap, refit)
  net/            RoomClient interface + Socket.IO and mock implementations
  state/          Zustand stores
  lib/            keepMandala.ts — renders the closing image
  screens/        Landing → Join → Loading → SoundCheck → Instrument
                  → Lobby → Play → Closing
```

## Conventions

### React never drives audio

Sub-millisecond scheduling cannot survive a render cycle. `engine/` is plain
TypeScript with no React imports, held as long-lived module-level references in
`sessionStore.ts`. React subscribes and paints; it never schedules.

If you reach for `useEffect` to trigger a sound, the logic belongs in the engine.

### The play surface is a canvas, and it does not re-render React

`CircleCanvas` reads live state from refs inside one `requestAnimationFrame`
loop. At sixty participants each pulsing on their own onset, React would be
reconciling a hundred elements several times a second while the engine is trying
to keep time. Do not convert it to DOM nodes.

It harvests hits by diffing `playheadStore.pulses` each frame — no extra
plumbing, and no React render per drum hit.

### One emblem per instrument, keyed by id

`ICON_PATHS` in `shared/src/icons.ts` is keyed by instrument id, so two
instruments cannot share an emblem by accident — there is no shared key to reach
for. `roster.test.ts` fails if any path repeats, if an instrument has no emblem,
or if an emblem outlives its instrument.

### Sustaining voices must not share a register

Four bed voices all holding notes in the same octave sound like one blurry
chord however different their timbres are. `Instrument.octave` spreads them, and
`roster.test.ts` enforces that no two sustaining voices in a family collide.
Articulation counts too: Rhodes is `sustains: false` so it is struck rather than
held, which separates it from the harmonium without moving it.

### Previews must differ per instrument

`previewFigure()` derives a different figure per instrument id. When every
instrument previewed with the same four notes, auditioning the tanpura, the pad
and the Rhodes played an identical tune three times and they all sounded alike —
the timbres were fine, the tune was the problem.

### The play surface is you in the middle

Everybody used to be an equal dot on one ring. Honest about the music, useless
as an instruction — you could not tell which one was you or what you were
supposed to do. Your own instrument is now the largest object on screen, and the
room orbits it, drifting.

That disc is both the instruction and the tap target, which is why it is big.

### Teaching is Simon Says, one hit at a time

A person learns a sequence by being shown one thing at a time. So although the
loop plays a player's *whole* part from the first bar — the room never hears a
partial arrangement — only ever **one hit is being asked for**. Find it, and the
lesson moves to the next.

`registerTap` deliberately credits only the hit currently being taught. Crediting
any un-released hit would let someone tapping steadily satisfy hits nobody had
shown them, and the lesson would run ahead of what they had learned.

Simon Says is the right model for one specific reason: **it never tells you that
you were bad.** It only ever shows you *when*. That is exactly, and only, the
feedback this app is allowed to give.

While cued, a tap also uses the stroke the arrangement asks for at that moment,
so a person who has never held a drum cannot pick the wrong sound. Choosing
between two sounds starts mattering only once the part is theirs.

### A tap must make a sound immediately

`AudioEngine.auditionOnset` sounds the stroke the instant the finger lands,
while the onset still goes into the loop at its quantized step. Before this, a
tap made *no sound at all* until the playhead came round — up to five seconds at
90bpm over eight beats — which reads as a broken app, not as quantization.

What you hear live is your hand; what the room hears next time round is the
grid. When the quantized step is still ahead of the playhead the loop skips it
once (`suppressOnce`), or the note would flam against the hand that just played
it.

### Takes are laid down, then locked

`loopState` is `open` or `locked`. While open, taps sound but nothing repeats
and the room cannot hear you; the take locks on the next bar line once it has
at least `GROOVE_MIN_TAPS` (3) onsets. Tapping while locked throws the take away
and starts a new one — that tap becomes its first.

Three rules follow from this and are easy to break by accident:

- **Phrases are only published once locked.** A take in progress is private, so
  nobody sees or hears someone feeling for a pattern.
- **Locking happens on the bar, not on the third tap.** That is what makes it
  feel like a loop pedal rather than a switch.
- **`onCycle` is called straight from the audio callback, not through
  `Tone.getDraw()`.** Locking is a state change, not a picture: it must still
  happen when the tab is backgrounded and rAF has been throttled to nothing.

### Use `Tone.getDraw()`, never `Tone.Draw`

The bare `Tone.Draw` singleton is deprecated in Tone 15 and bound to the context
that existed at module load. Use `Tone.getDraw()`, which resolves against the
live context.

### Three strokes, every instrument

`outer` / `center` / `sweep` is the entire input vocabulary. A drum reads them as
open / muted / roll; a flute as short / soft / glide. A player who swaps
instrument mid-session already knows how to play the new one. Do not add a
fourth, and do not give one instrument a special gesture.

### The room starting must not strand a latecomer

`session:began` only moves you to the play surface if you are actually seated.
The host can press Begin while someone is still on the sound check or picking an
instrument; pulling them in would drop them onto a play screen with no
instrument in hand, which rendered a black rectangle before this was fixed.
They finish getting ready, and `takeSeat` sends them straight in.

`PlayScreen` also refuses to render nothing, for the same reason.

### Room rules live in `shared/` too

`nextHost` sits beside `allocateInstrument` for the same reason: the server and
every client must agree on who inherits the circle when a host leaves, and two
implementations of "longest-present" will eventually disagree about a tie.

### Musical logic lives in `shared/`, not in either app

Scales, grids, density limits, allocation and pitch choice are pure and
deterministic so the server and every client compute identical answers.
Reimplementing any of it on one side is how a room silently desynchronises.

### Onsets are stored in touch order, not step order

The density cap evicts the *oldest touch*, so `Phrase.onsets` preserves
insertion order. Use `sortedOnsets()` when drawing. Sorting the stored array
breaks eviction in a way no type will catch.

### Never change `startedAt` for a tempo change

Ramp `bpm` instead. Moving the transport origin restarts the cycle and every
phone in the room stutters at once. The one legitimate move is `session:begin`.

### Samples are committed

`frontend/public/samples/` is ~2MB and in git on purpose, so the backend
developer and CI do not need ffmpeg. Regenerate with `tools/fetch-samples.mjs`
when the manifest changes; never hand-edit `CREDITS.md`, which is generated.

## Testing

`frontend/src/engine/__tests__/phrase.test.ts` covers quantization, same-step
replacement, the density cap, cycle refitting, and the pitch-choice guarantees
(stable per seed, inside the scale, resolves to the root often enough). These
are pure functions; test them directly rather than through the DOM.

Audio scheduling and clock sync are not unit-tested. Verify by running the app;
the mock reports a clock deliberately skewed 437ms from the browser's so the
sync path is exercised rather than accidentally bypassed.

## Open questions

Unresolved, and worth asking the user rather than guessing:

- **The brief is truncated.** It ends on a dangling `-` mid-*Presence*.
- **No facilitator section.** Implemented as host-only controls (the room's
  creator), which is an assumption.
- **Engagement summary is underspecified.** The intro promises "each person's
  engagement levels can be shown" while the features forbid ranking. Resolved by
  showing each viewer only their own figures plus a family-aggregated weave.

## Not yet built

- ~~Backend~~ — **built.** Node + Socket.IO in `backend/src/`, 44 wire evals,
  plus `frontend/src/__tests__/wire.test.ts` running the production client
  against it. Deploy story in `docs/DEPLOY.md`.
- **Real recordings for five Indian instruments.** Tabla, dholak, ghatam, bayan
  and tanpura are modelled, not sampled — no CC0/MIT source exists that I could
  find. See `docs/AUDIO_ASSETS.md`. This is the biggest available sound upgrade.
- **A second pass on the weakest emblems.** All 31 are distinct and legible, but
  kanjira, beatbox and conga are the least immediately readable of the set.
- **Reconnect/rejoin.** `SocketRoomClient` reconnects, but rejoining an
  in-progress room and restoring your phrase is untested against a real server.
  The prototype's "The circle is holding your place" banner is not wired up.
- **Host transfer end to end** is now covered on the wire
  (`backend/src/__tests__/hosting.test.ts`): explicit leave, disconnect grace,
  and offline candidates skipped. What remains untested is only the *browser
  feel* of the hand-over notice.
- **On-device testing.** Verified in desktop Chrome only. Touch behaviour, iOS
  audio unlock, and speaker levels need real phones.
- **Sound is unverified by ear.** Browser automation cannot hear; the sample
  pipeline is verified structurally (decodes to valid mono audio, triggers
  fire on schedule) but nobody has listened to it yet.

## Notes for Claude

- Keep `shared/src/protocol.ts` and `docs/PROTOCOL.md` in step. The TypeScript
  is authoritative; the doc explains intent.
- Check any change against the three guarantees before shipping it.
- Dark palette is deliberate — these sessions happen in dim rooms and a white
  screen in a circle is a lantern in everyone's face. Don't add a light theme
  without asking.
- Copy voice: plain, warm, second person, no exclamation marks. "Take your
  seat", "tend the circle", "the host will begin soon". Never say "user".
