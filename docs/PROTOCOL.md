# Wire protocol — frontend ↔ backend

**Status:** v3. See [SONG_MODE.md](SONG_MODE.md) for what v3 added and why.
**Source of truth:** [`shared/src/protocol.ts`](../shared/src/protocol.ts). This document
explains the *why*; the TypeScript is the *what*. If the two disagree, the
TypeScript wins and this file is out of date.

Both sides import `@godc/shared`, so changing an event shape breaks the build on
whichever side has not caught up. That is intentional.

---

## Division of responsibility

| Concern | Owner | Why |
| --- | --- | --- |
| Room lifecycle, codes, membership | **Backend** | Needs one authority |
| Shared clock origin (`startedAt`) | **Backend** | Every device derives timing from it |
| Instrument allocation | **Backend** | Must see the whole room to balance it |
| Density enforcement | **Both** | Client for feel, server for trust |
| Audio synthesis, scheduling, quantization | **Frontend** | Per-device, never leaves the phone |
| Mixing | **Neither** | Happens acoustically, in the room |

The last row is the unusual one and it shapes everything: **audio is never
streamed between devices.** Each phone plays only its own phrase out of its own
speaker. Phrases travel over the wire as tiny JSON structures so that other
phones can *draw* them, not sound them.

---

## Connection lifecycle

```
client                                    server
  │                                          │
  ├── connect (Socket.IO, websocket) ───────▶│
  │                                          │
  ├── room:create | room:join ──────────────▶│
  │◀───────────── Ack<JoinResult> ───────────┤   room snapshot + your id + server time
  │                                          │
  ├── clock:ping  ×5 (warmup) ──────────────▶│
  │◀───────────── ClockPongPayload ──────────┤   repeated every 5s thereafter
  │                                          │
  ├── instrument:select ────────────────────▶│
  │◀───────────── Ack<{instrumentId}> ───────┤
  │                                          │
  ├── phrase:update (fire and forget) ──────▶│
  │◀───────────── phrase:changed (others) ───┤
  │◀───────────── transport:state ───────────┤   host changed tempo/cycle/mood
  │                                          │
  │◀───────────── session:ended ─────────────┤
```

---

## The shared clock

This is the part most worth getting right, and the easiest to get subtly wrong.

`TransportState.startedAt` is **server epoch milliseconds for cycle 0, step 0**.
Every device computes its own offset from the server clock and derives beat
position from that single number. Get it wrong and the room flams.

### What the server must do

1. **Answer `clock:ping` immediately.** Reply with `Date.now()` read as late as
   possible in the handler — ideally the first statement. Any work done before
   reading the clock is measured by the client as network latency and folded
   into its offset estimate as error.
2. **Never change `startedAt` for a tempo change.** Ramping BPM keeps the cycle
   continuous; moving `startedAt` restarts it and every phone stutters. Only
   change it when genuinely restarting the loop.
3. **Bump `revision` on every transport change** so late-arriving updates can be
   discarded.

The client implements Cristian's algorithm over a rolling window, averaging the
lowest-latency third of samples — see [`frontend/src/engine/clock.ts`](../frontend/src/engine/clock.ts).
It needs nothing from the server but a fast, honest timestamp.

---

## Client → server

| Event | Payload | Ack | Notes |
| --- | --- | --- | --- |
| `room:create` | `CreateRoomPayload` | `Ack<JoinResult>` | Creator becomes host. `expectedSize` sets allocation targets |
| `room:join` | `JoinRoomPayload` | `Ack<JoinResult>` | Name only. No account, email, or password — ever |
| `room:leave` | — | — | Graceful exit |
| `clock:ping` | `{ t0 }` | `ClockPongPayload` | Echo `t0` untouched. Read your clock late |
| `instrument:select` | `SelectInstrumentPayload` | `Ack<{instrumentId}>` | **Omit `instrumentId` to request auto-allocation** |
| `phrase:update` | `Phrase` | — | High frequency. Do not ack. Only sent once a take has locked — see below |
| `phrase:clear` | — | — | |
| `transport:update` | `UpdateTransportPayload` | — | **Host only.** Emit `error` with `NOT_HOST` otherwise |
| `session:begin` | — | — | **Host only.** Leaves the lobby; re-origins `startedAt` |
| `session:end` | — | — | **Host only** |

## Server → client

| Event | Payload | When |
| --- | --- | --- |
| `room:state` | `Room` | On join, and after every reconnect |
| `participant:joined` | `Participant` | |
| `participant:updated` | `Participant` | Instrument change, connection change |
| `participant:left` | `{ participantId }` | Left for good — **not** when merely silent |
| `transport:state` | `TransportState` | Any host change |
| `session:began` | `TransportState` | Host pressed Begin. Carries the final `startedAt` |
| `host:changed` | `{ participantId, previousHostId, reason }` | The circle passed to a new host |
| `phrase:changed` | `{ participantId, phrase }` | Another participant edited. **Do not echo to the author** |
| `phrase:cleared` | `{ participantId }` | |
| `session:ended` | `SessionSummary` | Per-recipient: `you` differs for each socket |
| `error` | `ProtocolError` | |

---

## Server-side invariants

These are the rules the frontend assumes. Breaking one produces a musical bug
rather than a crash, which makes them expensive to debug later.

### 1. Allocation must use the shared function

```ts
import { allocateInstrument } from "@godc/shared";
const instrument = allocateInstrument(takenInstrumentIds, room.expectedSize);
```

`allocateInstrument` is pure and deterministic — least-deficit family, then
least-used instrument, with `INSTRUMENTS` order breaking ties. Reimplementing it
server-side means the client's preview and the server's answer can diverge.

Pass the instrument ids of **everyone except the requester**, in join order.

### 2. Density must be re-checked server-side

```ts
import { maxOnsets } from "@godc/shared";
if (phrase.onsets.length > maxOnsets(room.participants.length, room.transport.cycleBeats)) {
  // Reject, or truncate to the newest N. Do not trust the client.
}
```

The client already enforces this for feel. The server enforces it because one
stale or hostile phone should not be able to flood a room of sixty.

### 3. Onsets must be validated

- `0 <= step < cycleBeats * STEPS_PER_BEAT`
- `0 <= velocity <= 1`
- `stroke` ∈ `"outer" | "center" | "sweep"`
- At most one onset per `step` per participant

Note that `degree` is chosen by the client engine via `degreeForOnset(seed,
step)`, not by the player. It is deterministic, so the server can recompute and
compare it if it wants to; there is no need to trust it, and no harm in it
being wrong beyond one participant hearing an odd note.

Reject the whole phrase with `INVALID_PHRASE` rather than silently repairing it —
a repaired phrase that differs from what the player sees on their own screen is
worse than an error.

### 4. A participant may be silent for a while, on purpose

The client does not publish a phrase while the player is still laying it down.
They tap, hear themselves, and the take is only sent when it locks into a loop
on a bar line. So a participant can be connected, holding an instrument, and
sending nothing for a good few seconds. That is normal, not a stall — do not
time them out or treat the gap as a disconnect.

### 5. Revisions are monotonic per participant

Keep the highest `revision` seen. Drop anything lower. Without this, a delayed
packet on bad wifi resurrects a phrase the player already cleared.

### 6. The lobby is a real state

`Room.phase` is `gathering` → `playing` → `ended`. Sound does not start when the
first person arrives; the host waits for stragglers and presses Begin. On
`session:begin`, re-origin `TransportState.startedAt` to a whole second slightly
in the future so cycle zero starts cleanly rather than mid-bar, bump `revision`,
and broadcast `session:began`.

This is the one time `startedAt` should move. See the clock rules above.

### 7. The circle is never left without a host

The host holds the only irreversible controls. If they walk out with their
phone, the room must not be stranded with nobody able to close it.

```ts
import { nextHost, HOST_GRACE_MS } from "@godc/shared";
const heir = nextHost(room.participants, departingHostId);
```

**Longest-present connected participant wins.** `nextHost` is pure and
deterministic — same tie-break on every device — so use it rather than writing
the rule again. Ties on `joinedAt` break on participant id.

When to hand over:

- **On explicit `room:leave` from the host** — immediately.
- **On host disconnect** — only after `HOST_GRACE_MS` (60s) expires, the same
  grace ordinary participants get. A locked screen or a walk outside must not
  cost a facilitator their own session. This does mean up to a minute where
  nobody can close the room; that is the better trade.
- **When `nextHost` returns undefined** — nobody eligible is left, so end the
  room rather than keeping a hostless one alive.

Then:

1. Set `isHost` true on the heir and false on the departing host.
2. Emit `participant:updated` for both.
3. Emit `host:changed` with `{ participantId, previousHostId, reason }`.

Step 3 matters for more than bookkeeping: the client uses it to *tell* the new
host, rather than letting controls silently appear on their screen mid-session.

**A returning host does not get the circle back.** If the original host
reconnects after the hand-over, they rejoin as an ordinary participant. Passing
control back would flap if their connection is unstable, and could yank the
controls out from under someone already mid-action.

### 8. Disconnect ≠ absent

The brief is explicit: *"Participants who stop playing shown as present, not
absent or inactive."* On socket disconnect, set `connected: false` and **keep
the participant and their phrase in the room** for a grace period (60s is a
reasonable default). Only emit `participant:left` after that expires, or on an
explicit `room:leave`. A phone that locks its screen mid-session has not left
the circle.

### 9. `session:ended` is per-recipient

`SessionSummary.you` must be computed for each socket individually.

`SessionSummary.room.weave` is aggregated **by family, not by person** — one
array of per-step counts for each of `rhythm`/`bass`/`bed`/`top`. This is
deliberate and load-bearing: the brief forbids ranking or comparison between
people, so the summary has no field capable of carrying another participant's
figures. `room.roster` carries names and instruments only, never counts.

**The weave needs no database.** It is a fold over the phrases the server is
already holding in memory to fan them out — four arrays of at most 64 small
integers, computed once at session end, emitted, and forgotten. Nothing about
the closing screen requires persistence: the whole app stores nothing between
sessions except the player's own name, in their own browser. Reference
implementation is ~15 lines; see `endSession` in the mock.

---

## Errors

`ErrorCode` is a closed union in `protocol.ts`: `ROOM_NOT_FOUND`, `ROOM_FULL`,
`ROOM_ENDED`, `NAME_REQUIRED`, `NOT_HOST`, `INVALID_PHRASE`, `RATE_LIMITED`,
`PROTOCOL_MISMATCH`, `INTERNAL`.

Every ack is `Ack<T>` — `{ ok: true, data }` or `{ ok: false, error }`. Never
throw across the wire. `message` is shown to the user, so write it for a person
standing in a room, not for a log file.

---

## What changed in v3

Song mode. Full rationale in [SONG_MODE.md](SONG_MODE.md).

- `Room.mode` (`jam` | `song`), `Room.songId`, `Room.votes`
- `Participant.roleId` and `.rolePart`
- `TransportState.rootMidi?` — a key override, since three fixed moods cannot
  express every key a piece might be in
- `song:vote` in; `song:votes` and `song:chosen` out

Two things a server implementer should know:

- **Arrangements never travel.** Every client ships the catalogue, so
  `songId` + `roleId` + `rolePart` is enough for a phone to derive its own part.
- **Cue state is not the server's business.** Whether and when somebody found
  their part stays on their phone. Do not add it to the protocol.

## What changed in v2

- `Onset.gesture` → `Onset.stroke`, a closed union of `outer | center | sweep`.
  The play surface is one circle, not a keyboard, and the same three strokes
  mean something on every instrument in the roster.
- `Onset.degree` is now assigned by the engine rather than the player.
- `Room.phase` added, with `session:begin` / `session:began`.
- `SessionSummary.room` gained `roster` and `weave`.
- Families renamed `percussion|bass|harmonic|melodic` → `rhythm|bass|bed|top`.
- Moods renamed to `dawn|monsoon|night`; cycle options are now 6, 8 and 16.
- `host:changed` added, with the `nextHost` rule in `shared/src/hosting.ts`.

## Reference: the mock

[`frontend/src/net/mockClient.ts`](../frontend/src/net/mockClient.ts) is a
complete, working implementation of this protocol in ~350 lines. It is the
cheapest way to see the expected shapes in motion, and it deliberately reports a
clock skewed 437ms from the browser's so the sync path is exercised rather than
accidentally bypassed.

It is **not** a spec for server internals — it has no persistence, no validation,
and no multi-client support.
