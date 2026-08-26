# Evals

What the product promises, and the test that holds it to the promise. Run
everything with `npm test` at the root — frontend and backend suites both run.

**165 tests: 121 frontend, 44 backend.** No network access needed; the backend
evals spin a real Socket.IO server on an ephemeral port and drive it with real
socket clients.

## The guarantees

| Promise | Held by |
| --- | --- |
| Timing is always correct — input snaps to a shared grid | `frontend/src/engine/__tests__/phrase.test.ts` (quantize, wrap, same-step replace) |
| Pitch is always correct — players never choose a note | `phrase.test.ts` (degree assignment stable per seed, inside the scale, resolves home) |
| Texture stays open as the room grows — density cap | `phrase.test.ts` (cap tightens, eviction order); `backend/src/__tests__/phrases.test.ts` (server rejects over-cap) |
| Nobody is ranked, ever | `backend/src/__tests__/session.test.ts` — the summary is checked **by shape**: `room` has exactly five keys, roster entries exactly two, weave keyed by family. A per-person count cannot be added without a failure |
| The circle is never left without a host | `frontend/src/__tests__/hosting.test.ts` (the shared rule); `backend/src/__tests__/hosting.test.ts` (on the wire: leave = immediate, disconnect = after grace, offline candidates skipped) |
| Disconnect ≠ absent | `backend/.../hosting.test.ts` — a dropped socket is marked present-but-disconnected and keeps its seat for the grace period |
| One arrangement serves 5 to 60 people | `frontend/src/__tests__/interlock.test.ts` — every song × 8 room sizes: nobody over cap, nobody empty-handed, the room still hears the complete pattern |
| The song's instrument ratio holds at scale; locked instruments exist in the kit | `interlock.test.ts` — weighted assignment (We Will Rock You stays stomps-and-claps at 60), every `RoleDef.instruments` id present in the roster |
| Cues teach one hit at a time and always let go | `frontend/src/__tests__/songmode.test.ts` — lesson order, only-the-taught-hit credited, the never-found-it timeout, nothing re-cued |
| Every sound in the kit is really on disk | `frontend/src/__tests__/kit.test.ts` — a filename typo is silence, and silence is unnoticeable in a full room |

## The wire

| Concern | Held by |
| --- | --- |
| Entry: create/join with a name only, stale protocol refused | `backend/src/__tests__/lifecycle.test.ts` |
| Clock pings echo honestly and answer fast | `lifecycle.test.ts` (<50ms average in-process) |
| Phrases fan out to everyone but the author; clears travel | `backend/src/__tests__/phrases.test.ts` |
| Stale revisions dropped; a clear resets the floor | `phrases.test.ts` |
| Malformed phrases rejected whole, never repaired | `phrases.test.ts` (off-grid, negative, hot velocity, unknown stroke, duplicates, unknown instrument) |
| Runaway clients rate-limited | `phrases.test.ts` |
| Transport host-only, clamped, `startedAt` immovable | `backend/src/__tests__/session.test.ts` |
| Begin re-origins on a whole second, once | `session.test.ts` |
| Votes tally live, last-per-person; junk ignored | `backend/src/__tests__/songmode.test.ts` |
| The settle: majority wins, parts for all, instruments dealt by the song | `songmode.test.ts` |
| Late joiner dealt their part at the door, instrument included | `songmode.test.ts` |

## The capstones

**`backend/src/__tests__/fullsession.test.ts`** scripts an entire evening:
eight people gather, take instruments, vote (garba wins 3–2–1), begin, each
derives its interlocked part with the same shared `distributeRole` the phones
use and publishes it, a witness hears exactly seven voices and never its own
echo, one guest leaves, then the **host** leaves and the circle passes to the
longest-present, and the heir closes it — after which every remaining phone's
summary adds up: roster right, totals equal to what was actually published,
weave equal to the totals, personal figures each person's own, shared figures
identical for all.

Then **thirty-one phones**: gather, begin, thirty grooves fanned out and all
arriving inside five seconds, and a clean close at full size.

**`frontend/src/__tests__/wire.test.ts`** is the drift-catcher: the production
`SocketRoomClient` — the literal code a phone executes — run against the
production server over a real socket. If the two ends ever disagree about the
protocol, it fails here rather than at a retreat.

## What no eval can cover

How it feels. Latency under a real finger on a real phone speaker, whether the
cue ring reads as "now", whether the kit sits right in a room's air — those need
ears and a device, and always will.
