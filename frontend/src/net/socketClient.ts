/**
 * Socket.IO implementation of RoomClient.
 *
 * Types come straight from @godc/shared, so if the backend changes an event
 * shape this file stops compiling — which is the entire point of the shared
 * package.
 */

import { io, type Socket } from "socket.io-client";
import {
  PROTOCOL_VERSION,
  type Ack,
  type ClientToServerEvents,
  type ClockPongPayload,
  type CreateRoomPayload,
  type JoinResult,
  type JoinRoomPayload,
  type Phrase,
  type SelectInstrumentPayload,
  type ServerToClientEvents,
  type UpdateTransportPayload,
} from "@godc/shared";
import type { RoomClient, Unsubscribe } from "./RoomClient";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Acks must not hang forever; a phone on bad wifi needs to see an error. */
const ACK_TIMEOUT_MS = 8000;

export class SocketRoomClient implements RoomClient {
  private socket: TypedSocket | null = null;

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    if (this.socket?.connected) return Promise.resolve();

    this.socket = io(this.url, {
      // WebSocket first for latency, but NEVER websocket-only: tunnels,
      // corporate wifi and some mobile carriers refuse the upgrade, and a
      // client with no fallback just hangs at "Finding the circle…" forever.
      // Long-polling gets through nearly anything; the clock sync measures
      // real round-trips either way, so timing stays honest.
      transports: ["websocket", "polling"],
      // Retreat wifi drops constantly. Reconnect hard and keep the session.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });

    return new Promise((resolve, reject) => {
      const socket = this.socket!;
      const onConnect = () => {
        socket.off("connect_error", onError);
        resolve();
      };
      const onError = (err: Error) => {
        socket.off("connect", onConnect);
        reject(err);
      };
      socket.once("connect", onConnect);
      socket.once("connect_error", onError);
    });
  }

  disconnect(): void {
    this.socket?.emit("room:leave");
    this.socket?.disconnect();
    this.socket = null;
  }

  private emitWithAck<T>(
    send: (socket: TypedSocket, ack: (r: T) => void) => void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket) {
        reject(new Error("Not connected"));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Server did not respond"));
      }, ACK_TIMEOUT_MS);

      send(socket, (r: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(r);
      });
    });
  }

  createRoom(p: CreateRoomPayload): Promise<Ack<JoinResult>> {
    return this.emitWithAck<Ack<JoinResult>>((s, ack) =>
      s.emit("room:create", { ...p, protocolVersion: PROTOCOL_VERSION }, ack),
    );
  }

  joinRoom(p: JoinRoomPayload): Promise<Ack<JoinResult>> {
    return this.emitWithAck<Ack<JoinResult>>((s, ack) =>
      s.emit("room:join", { ...p, protocolVersion: PROTOCOL_VERSION }, ack),
    );
  }

  ping(t0: number): Promise<ClockPongPayload> {
    return this.emitWithAck<ClockPongPayload>((s, ack) =>
      s.emit("clock:ping", { t0 }, ack),
    );
  }

  selectInstrument(p: SelectInstrumentPayload): Promise<Ack<{ instrumentId: string }>> {
    return this.emitWithAck<Ack<{ instrumentId: string }>>((s, ack) =>
      s.emit("instrument:select", p, ack),
    );
  }

  // Fire-and-forget: waiting on an ack here would stall the player's hands.
  updatePhrase(phrase: Phrase): void {
    this.socket?.emit("phrase:update", phrase);
  }

  clearPhrase(): void {
    this.socket?.emit("phrase:clear");
  }

  voteSong(songId: string): void {
    this.socket?.emit("song:vote", { songId });
  }

  updateTransport(p: UpdateTransportPayload): void {
    this.socket?.emit("transport:update", p);
  }

  beginSession(): void {
    this.socket?.emit("session:begin");
  }

  endSession(): void {
    this.socket?.emit("session:end");
  }

  on<E extends keyof ServerToClientEvents>(
    event: E,
    handler: ServerToClientEvents[E],
  ): Unsubscribe {
    const socket = this.socket;
    if (!socket) return () => {};
    // socket.io's typed overloads do not narrow across a generic E.
    socket.on(event, handler as never);
    return () => {
      socket.off(event, handler as never);
    };
  }
}
