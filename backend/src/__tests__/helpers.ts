/**
 * Test rig: a real Socket.IO server on an ephemeral port, driven by real
 * socket.io-client connections. Nothing is mocked — these evals exercise the
 * exact wire the phones will use.
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type GroupSize,
  type JoinResult,
  type RoomMode,
  type ServerToClientEvents,
} from "@godc/shared";
import { attachGodcServer, type GodcServerOptions } from "../server.js";

export type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

export interface TestRig {
  url: string;
  connect(): TestClient;
  close(): Promise<void>;
}

export async function startRig(options: GodcServerOptions = {}): Promise<TestRig> {
  const httpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: "*" },
  });
  const godc = attachGodcServer(io, options);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  const url = `http://localhost:${port}`;
  const clients: TestClient[] = [];

  return {
    url,
    connect() {
      const socket = connectClient(url, { transports: ["websocket"] });
      clients.push(socket);
      return socket;
    },
    async close() {
      for (const socket of clients) socket.disconnect();
      godc.close();
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}

export function createRoom(
  socket: TestClient,
  hostName: string,
  mode: RoomMode = "jam",
  expectedSize: GroupSize = "medium",
): Promise<JoinResult> {
  return new Promise((resolve, reject) => {
    socket.emit(
      "room:create",
      { hostName, expectedSize, mode, protocolVersion: PROTOCOL_VERSION },
      (r) => (r.ok ? resolve(r.data) : reject(new Error(r.error.code))),
    );
  });
}

export function joinRoom(
  socket: TestClient,
  roomCode: string,
  name: string,
): Promise<JoinResult> {
  return new Promise((resolve, reject) => {
    socket.emit(
      "room:join",
      { roomCode, name, protocolVersion: PROTOCOL_VERSION },
      (r) => (r.ok ? resolve(r.data) : reject(new Error(r.error.code))),
    );
  });
}

export function selectInstrument(
  socket: TestClient,
  instrumentId?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.emit("instrument:select", { instrumentId }, (r) =>
      r.ok ? resolve(r.data.instrumentId) : reject(new Error(r.error.code)),
    );
  });
}

export function ping(socket: TestClient): Promise<{ t0: number; serverTime: number }> {
  return new Promise((resolve) => {
    socket.emit("clock:ping", { t0: Date.now() }, resolve);
  });
}

/** The next emission of one event, or a loud failure. */
export function waitFor<E extends keyof ServerToClientEvents>(
  socket: TestClient,
  event: E,
  timeoutMs = 4000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${String(event)}`)),
      timeoutMs,
    );
    socket.once(event, ((payload: never) => {
      clearTimeout(timer);
      resolve(payload);
    }) as never);
  });
}

/** Everything an event emits from now on. Call stop() to read. */
export function collect<E extends keyof ServerToClientEvents>(
  socket: TestClient,
  event: E,
): { all: () => Array<Parameters<ServerToClientEvents[E]>[0]> } {
  const seen: Array<Parameters<ServerToClientEvents[E]>[0]> = [];
  socket.on(event, ((payload: never) => {
    seen.push(payload);
  }) as never);
  return { all: () => [...seen] };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
