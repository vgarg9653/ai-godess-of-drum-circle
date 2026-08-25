// @vitest-environment node
/**
 * EVAL: the production client against the production server.
 *
 * Everything else tests the two ends separately. This runs the actual
 * `SocketRoomClient` — the code a phone executes — against the actual backend
 * over a real socket, so a drift between them fails here before it fails at a
 * retreat.
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@godc/shared";
import { attachGodcServer, type GodcServer } from "../../../backend/src/server.js";
import { SocketRoomClient } from "@/net/socketClient";

let httpServer: ReturnType<typeof createServer>;
let io: Server<ClientToServerEvents, ServerToClientEvents>;
let godc: GodcServer;
let url = "";
const clients: SocketRoomClient[] = [];

function client(): SocketRoomClient {
  const c = new SocketRoomClient(url);
  clients.push(c);
  return c;
}

beforeAll(async () => {
  httpServer = createServer();
  io = new Server(httpServer, { cors: { origin: "*" } });
  godc = attachGodcServer(io);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.disconnect();
  godc.close();
  await new Promise<void>((resolve) => {
    io.close(() => resolve());
  });
});

describe("the phone's own client, on the real wire", () => {
  it("creates, joins, hears arrivals, and votes — through the RoomClient interface", async () => {
    const host = client();
    await host.connect();
    const created = await host.createRoom({
      hostName: "Asha",
      expectedSize: "small",
      mode: "song",
      protocolVersion: PROTOCOL_VERSION,
    });
    if (!created.ok) throw new Error(created.error.code);
    const code = created.data.room.code;

    const arrival = new Promise<string>((resolve) => {
      host.on("participant:joined", (p) => resolve(p.name));
    });

    const guest = client();
    await guest.connect();
    const joined = await guest.joinRoom({
      roomCode: code,
      name: "Ravi",
      protocolVersion: PROTOCOL_VERSION,
    });
    if (!joined.ok) throw new Error(joined.error.code);
    expect(joined.data.room.mode).toBe("song");
    expect(await arrival).toBe("Ravi");

    const tally = new Promise<Record<string, string>>((resolve) => {
      host.on("song:votes", ({ votes }) => resolve(votes));
    });
    guest.voteSong("garba");
    expect(Object.values(await tally)).toContain("garba");
  });

  it("keeps the shared clock honest through the client's ping", async () => {
    const c = client();
    await c.connect();
    const before = Date.now();
    const pong = await c.ping(before);
    expect(pong.t0).toBe(before);
    expect(Math.abs(pong.serverTime - Date.now())).toBeLessThan(1500);
  });

  it("carries a phrase from one production client to another", async () => {
    const a = client();
    await a.connect();
    const created = await a.createRoom({
      hostName: "A",
      expectedSize: "small",
      mode: "jam",
      protocolVersion: PROTOCOL_VERSION,
    });
    if (!created.ok) throw new Error(created.error.code);

    const b = client();
    await b.connect();
    const joined = await b.joinRoom({
      roomCode: created.data.room.code,
      name: "B",
      protocolVersion: PROTOCOL_VERSION,
    });
    if (!joined.ok) throw new Error(joined.error.code);

    const heard = new Promise<number>((resolve) => {
      b.on("phrase:changed", ({ phrase }) => resolve(phrase.onsets.length));
    });
    a.updatePhrase({
      instrumentId: "tabla",
      revision: 1,
      onsets: [
        { step: 0, velocity: 0.9, stroke: "outer" },
        { step: 8, velocity: 0.7, stroke: "center" },
      ],
    });
    expect(await heard).toBe(2);

    const began = new Promise<number>((resolve) => {
      b.on("session:began", (t) => resolve(t.startedAt));
    });
    a.beginSession();
    expect((await began) % 1000).toBe(0);
  });
});
