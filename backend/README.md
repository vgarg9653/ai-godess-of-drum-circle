# Backend — the room server

Node + Socket.IO, implementing **protocol v3** from `@godc/shared`. This is no
longer a stub: rooms, joining, the shared clock, instrument allocation, phrase
validation and fan-out, song voting and the settle, host succession, disconnect
grace, and per-recipient closing summaries are all here and covered by 44
integration evals (see [`../docs/EVALS.md`](../docs/EVALS.md)).

## Run it

```bash
npm run dev:backend     # from the repo root — tsx watch, port 3000
npm start               # production boot (Railway/Render run exactly this)
PORT=8080 npm start     # the platform's port lands here automatically
```

Health check: `GET /health` → `{"ok":true}`. Sockets on the default
`/socket.io` path. CORS is open — the room code is the only credential this
app has ever had.

## Point the frontend at it

```bash
echo 'VITE_SERVER_URL=http://localhost:3000' > frontend/.env.local   # local
# on Vercel: Project → Settings → Environment Variables → VITE_SERVER_URL
```

Unset, the frontend runs against its in-browser mock as always.

## Shape

```
src/
  index.ts     boot: http + /health + Socket.IO
  server.ts    every event handler; the wiring between sockets and state
  rooms.ts     the registry — room state and its rules, no socket knowledge
  validate.ts  phrase validation + rate limiting
  summary.ts   the closing summary, built per recipient
```

The musical decisions — allocation, role assignment, host succession, the
winning-song rule — are all calls into `@godc/shared`, never re-implementations.
The server must compute what every phone computes, and the only reliable way is
to run the same code.

## Invariants it implements

The full list with rationale is [`../docs/PROTOCOL.md`](../docs/PROTOCOL.md).
The ones that shape the code:

- **`clock:ping` reads the clock in its first statement.** Anything done before
  that read becomes timing error on sixty phones.
- **Disconnect ≠ absent.** A dropped socket keeps its seat (and its hosting)
  for a 60s grace; only expiry or an explicit leave removes anyone.
- **`startedAt` never moves** for a tempo change. The one legal move is Begin.
- **Phrases are rejected whole, never repaired** — a phrase silently "fixed"
  server-side no longer matches the player's own screen.
- **Summaries are per-recipient and structurally incapable of ranking.**
- **Cue state does not exist here.** There is no event that could carry it.

## Why not Vercel

The frontend deploys there; this process cannot: functions cap at 300s on
Hobby against 5–20 minute sessions, instances share nothing, and in-memory
room state is the design. Use a persistent process — Railway, Render, Fly.io.
See [`../docs/DEPLOY.md`](../docs/DEPLOY.md).
