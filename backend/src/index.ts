/**
 * Boot the room server.
 *
 * One HTTP server carrying three things: a health check for the hosting
 * platform, the Socket.IO endpoint for the phones, and — when a frontend build
 * exists at ../frontend/dist — the app itself, as static files with an SPA
 * fallback. That last part means a single process (and a single URL) can carry
 * the whole product: one Railway service, or one tunnel from a laptop.
 *
 * CORS is open: the room code is the only credential this app has ever had.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@godc/shared";
import { attachGodcServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);

const DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../frontend/dist",
);
const hasFrontend = existsSync(path.join(DIST, "index.html"));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "godc-room-server" }));
    return;
  }

  if (!hasFrontend) {
    res.writeHead(req.url === "/" ? 200 : 404, {
      "content-type": "application/json",
    });
    res.end(JSON.stringify({ ok: true, service: "godc-room-server" }));
    return;
  }

  // Static file, or the SPA fallback — a room IS a link, so /r/ABCD must
  // serve the app, not a 404.
  const rawPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const resolved = path.normalize(path.join(DIST, rawPath));
  const candidate =
    resolved.startsWith(DIST) && // no path traversal
    existsSync(resolved) &&
    statSync(resolved).isFile()
      ? resolved
      : path.join(DIST, "index.html");

  const ext = path.extname(candidate);
  res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    // The kit's filenames never change; everything else revalidates.
    "cache-control": rawPath.startsWith("/essential-kit/")
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
  createReadStream(candidate).pipe(res);
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: "*" },
});

attachGodcServer(io);

httpServer.listen(port, () => {
  console.log(
    `[godc] room server on :${port}${hasFrontend ? " — serving the app too" : ""}`,
  );
});
