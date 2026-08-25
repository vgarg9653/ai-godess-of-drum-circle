/**
 * Boot the room server.
 *
 * One HTTP server carrying a health check for the hosting platform and the
 * Socket.IO endpoint for the phones. CORS is open: the room code is the only
 * credential this app has ever had, and the origin list would otherwise need
 * editing every time the frontend moved.
 */

import { createServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@godc/shared";
import { attachGodcServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);

const httpServer = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "godc-room-server" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: "*" },
});

attachGodcServer(io);

httpServer.listen(port, () => {
  console.log(`[godc] room server listening on :${port}`);
});
