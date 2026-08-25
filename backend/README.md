# Backend — the room server

**Not implemented.** This directory is a placeholder so the workspace resolves.

This variant has **its own backend**, independent of the one being built against
[goddess-of-drum-circle](https://github.com/vgarg9653/goddess-of-drum-circle).
Nothing here has to match that implementation, and the protocol below is a
starting point rather than a contract with anyone else.

## It cannot go on Vercel

The frontend deploys to Vercel happily. The realtime server does not, and it is
worth knowing why before trying:

- Vercel functions cap out at **300s on Hobby**, 800s on Pro. Sessions are
  **5 to 20 minutes**, so on Hobby the socket dies at the shortest session the
  app supports.
- Connections are not guaranteed to reach the same instance, and there is no
  built-in cross-instance broadcast — two phones in one room could land on
  different functions and effectively be in different rooms.
- In-memory room state does not survive between invocations, which is exactly
  what the design below assumes.
- Cold starts and instance hops perturb the clock offset estimate, and the
  shared clock is the thing that makes the room play in time at all.

Run it somewhere with a persistent process — Railway, Render, Fly.io — or
rebuild it on **Cloudflare Durable Objects / PartyKit**, where one object per
room holding its own state and sockets maps almost exactly onto this design.

## Start here

1. [`../docs/PROTOCOL.md`](../docs/PROTOCOL.md) — the contract, and the
   server-side invariants that matter. Read the invariants section twice; each
   one produces a *musical* bug rather than a crash if broken, which makes them
   expensive to find later.
2. [`../shared/src/protocol.ts`](../shared/src/protocol.ts) — the types. Import
   them; do not redeclare them.
3. [`../frontend/src/net/mockClient.ts`](../frontend/src/net/mockClient.ts) — a
   working ~350-line implementation of the same protocol. Useful as a reference
   for shapes and sequencing, not for server internals.

## What you own

- Room lifecycle: creation, 4-character codes, join, membership, expiry
- The shared clock origin (`TransportState.startedAt`) and fast `clock:ping`
  replies
- Instrument allocation — call `allocateInstrument()` from `@godc/shared`, don't
  reimplement it
- Server-side validation of phrases (density, step range, gestures, revisions)
- Fan-out of phrase and transport changes
- Per-recipient `SessionSummary` at session end

## What you don't

- Any audio. No synthesis, no mixing, no streaming. Phrases are small JSON
  structures; the sound is made on each phone and mixed acoustically in the room.
- Any musical decision. Scales, grids, density limits and the instrument roster
  all live in `@godc/shared` so both sides compute identical answers.

## Suggested shape

```
backend/
  src/
    index.ts        HTTP + Socket.IO bootstrap
    rooms.ts        Room registry, codes, expiry, disconnect grace period
    handlers.ts     One handler per ClientToServerEvents key
    validate.ts     Phrase and payload validation
```

Suggested deps: `socket.io`, `zod` (validate at the boundary), `tsx` for dev,
`vitest` to match the frontend. In-memory room state is fine for v1 — sessions
are 5–20 minutes and a restart ending live rooms is acceptable at this stage.

Wire the frontend to your server by setting `VITE_SERVER_URL`:

```bash
echo 'VITE_SERVER_URL=http://localhost:3000' > ../frontend/.env.local
```

Leave it unset to go back to the mock.
