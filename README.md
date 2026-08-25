# AI Goddess of Drum Circle

> **An independent variant.** This started as a copy of
> [goddess-of-drum-circle](https://github.com/vgarg9653/goddess-of-drum-circle)
> and goes its own way from here: its own backend, and free to change the
> protocol, the instruments and the musical model. The two apps are **not**
> expected to stay interoperable.
>
> The original repo is wired up as the `upstream` git remote, so fixes can be
> carried across in either direction — see [`CLAUDE.md`](CLAUDE.md#staying-in-touch-with-upstream).


A collaborative instrument for people who are physically in the same room.
Everyone opens the same link, each phone becomes an instrument, and short tapped
phrases loop against a beat and key shared across every device. The sound comes
out of each phone's own speaker and mixes **acoustically, in the air** — nothing
is streamed between devices.

Designed for people with no musical training. Timing is snapped to a grid and
pitch is constrained to a shared scale, so there is no way to play a wrong note.
No score, no ranking, no way to fail.

Retreats, workshops, classrooms, offsites. 3 to ~60 people, 5 to 20 minutes.

## Quick start

```bash
npm install
node tools/fetch-samples.mjs   # once, needs ffmpeg — fetches ~2MB of samples
npm run dev                    # http://localhost:5173
```

No backend needed. With `VITE_SERVER_URL` unset the app runs against a complete
in-browser mock server, seeded with synthetic participants.

To test with real phones on the same wifi, the dev server already binds to all
interfaces — use the Network URL Vite prints.

## Layout

```
shared/     Protocol types, musical constants, instrument roster.
            Imported by BOTH frontend and backend. The contract.
frontend/   Vite + React + TypeScript + Tone.js. This is the app.
backend/    Node + Socket.IO room server. Not written yet — see backend/README.md.
docs/       PROTOCOL.md (the API contract), AUDIO_ASSETS.md (sample sourcing).
tools/      Sample fetch pipeline and its licence manifest.
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Frontend dev server |
| `npm run build` | Typecheck shared, then build frontend |
| `npm run typecheck` | Every workspace |
| `npm test` | Vitest |
| `node tools/fetch-samples.mjs` | Fetch/convert samples (needs ffmpeg) |

## Status

Frontend is complete and playable end to end against the mock: landing, join,
preload gate, sound check, balanced instrument allocation with preview and swap,
lobby, the play canvas, host controls, and the closing weave with a downloadable
mandala.

31 instruments; 25 play real CC0/MIT recordings, six are hand-built models.
See [`docs/AUDIO_ASSETS.md`](docs/AUDIO_ASSETS.md).

Backend does not exist. The protocol it must implement is frozen and documented
in [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

See [`CLAUDE.md`](CLAUDE.md) for architecture and open work.

## Deploying the frontend

The frontend is a static build and deploys to Vercel from
[`vercel.json`](vercel.json) with no further configuration — import the repo and
it builds `frontend/dist` from the workspace root.

Two things in that config are load-bearing:

- **The rewrite to `index.html`.** Every route but `/` is client-side, and a
  room *is* a link — `/r/ABCD`. Without a rewrite, a phone opening a join link
  gets a 404 from the CDN before React ever runs, breaking the one action the
  whole app depends on.

  It is deliberately **not** a plain `/(.*)` catch-all. Vercel is widely said to
  check the filesystem before applying rewrites, but that ordering is not stated
  in their docs, and a rewrite that swallowed `/samples/*.mp3` would silently
  leave every instrument mute in production. So the pattern matches only
  dot-free paths outside `assets/` and `samples/` — which is exactly the set of
  client routes, and provably cannot shadow a real file.
- **Immutable caching on `/samples/`.** Sixty phones each pulling ~2MB over one
  venue access point is the actual load pattern. The filenames never change, so
  they cache for a year.

The realtime backend cannot go on Vercel — see the note in
[`backend/README.md`](backend/README.md).

## Licence

Code is [MIT](LICENSE). The bundled audio is **not** — see
[`NOTICE.md`](NOTICE.md).
