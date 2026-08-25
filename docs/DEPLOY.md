# Going live

Two deploys: a static frontend and a long-running room server. Total cost at
hobby scale: free tier on both.

## 1. The room server (Railway — or Render/Fly)

The repo is pre-wired: **root `npm start` boots the server**, `PORT` is read
from the environment, `/health` answers health checks.

**Railway:** New Project → Deploy from GitHub → pick this repo. It runs
`npm install` and `npm start`. Done — copy the public URL it assigns
(`https://something.up.railway.app`).

**Render:** New → Web Service → this repo. Build `npm install`, start
`npm start`, health check path `/health`. Free instances sleep when idle — the
first phone to arrive waits ~30s while it wakes. Fine for testing; pick a paid
instance for a real event.

Nothing on Vercel: the server holds rooms in memory and sessions outlive the
function cap. Reasoning in [`../backend/README.md`](../backend/README.md).

## 2. The frontend (Vercel)

Import the repo at vercel.com. `vercel.json` already sets the build, the output
directory, the SPA rewrite that keeps `/r/ABCD` join links from 404ing, and
immutable caching on the kit.

Add one environment variable, then redeploy:

```
VITE_SERVER_URL = https://<your-railway-url>
```

It is baked in at build time — changing it means redeploying, not just saving.
Leave it unset and the deployed app runs its in-browser mock: every phone gets
a private demo room, which demos one person's experience and connects nobody.

## 3. Prove it

1. Open the Vercel URL on two phones (or a phone and a laptop).
2. Start a circle on one; join by code — or the `/r/CODE` link — on the other.
3. Both appear in the lobby; begin; a groove laid on one phone shows on the
   other's play surface.
4. Lock the host's phone for under a minute — the room holds their seat.
   Leave outright — the circle passes to the other.

## Known limits at go-live

- **One server region.** The shared clock assumes comparable round-trips;
  a room split across continents will feel loose. One venue, one room: fine.
- **Rooms are in memory.** A server restart ends live rooms. Sessions are 5–20
  minutes; acceptable, documented, revisit if it ever hurts.
- **No rejoin.** A phone that reloads mid-session re-enters as a new
  participant. The grace period covers locks and blips, not reloads.
- **The kit's provenance** (`docs/AUDIO_ASSETS.md`) — accepted for now, on
  record, swappable file-for-file when re-sourced.
