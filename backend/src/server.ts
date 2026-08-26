/**
 * Wires the room registry to Socket.IO.
 *
 * All events and payload shapes come from @godc/shared, so a drift between this
 * and the phones is a compile error rather than a mystery at a retreat.
 *
 * Design notes, in the order they matter:
 *
 *  - `clock:ping` reads the wall clock in its first statement. Every phone
 *    derives its offset from these replies; any work done before reading the
 *    clock is measured by the client as network latency and folded into the
 *    room's timing as error.
 *  - Disconnect ≠ absent. A dropped socket marks its participant
 *    disconnected and starts a grace timer; only expiry (or an explicit
 *    leave) removes them. A locked phone screen must not cost anyone their
 *    place — or, if they are hosting, their circle.
 *  - Cue state never reaches this process. Whether and when somebody found
 *    their part is not the server's business, and there is deliberately no
 *    event that could carry it.
 */

import type { Server, Socket } from "socket.io";
import {
  PROTOCOL_VERSION,
  SONGS,
  getInstrument,
  type ClientToServerEvents,
  type Phrase,
  type ProtocolError,
  type ServerToClientEvents,
} from "@godc/shared";
import { RoomRegistry, ROOM_CAP, type ServerRoom } from "./rooms.js";
import { RateLimiter, validatePhrase } from "./validate.js";
import { buildSummary } from "./summary.js";

type Io = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface GodcServerOptions {
  /** How long a vanished socket keeps its seat (and its hosting). */
  disconnectGraceMs?: number;
  /** Phrase updates allowed per second per participant. */
  maxPhraseUpdatesPerSec?: number;
  /** How often to sweep for dead rooms. */
  expirySweepMs?: number;
  /** How long an ended or emptied room lingers before deletion. */
  roomLingerMs?: number;
}

export interface GodcServer {
  registry: RoomRegistry;
  close(): void;
}

const err = (code: ProtocolError["code"], message: string): ProtocolError => ({
  code,
  message,
});

/**
 * Unref a timer without caring whose typings are in scope. This file is also
 * imported by a frontend eval that runs the real SocketRoomClient against the
 * real server, and under DOM typings setTimeout returns a number.
 */
function unrefSafe(timer: unknown): void {
  if (timer && typeof timer === "object" && "unref" in timer) {
    (timer as { unref(): void }).unref();
  }
}

export function attachGodcServer(io: Io, options: GodcServerOptions = {}): GodcServer {
  const {
    disconnectGraceMs = 60_000,
    maxPhraseUpdatesPerSec = 25,
    expirySweepMs = 60_000,
    roomLingerMs = 10 * 60_000,
  } = options;

  const registry = new RoomRegistry();
  const limiter = new RateLimiter(maxPhraseUpdatesPerSec);

  /** The room and participant a socket belongs to, or null when adrift. */
  function whereIs(socket: Sock): { sroom: ServerRoom; pid: string } | null {
    const code = socket.data.code as string | undefined;
    const pid = socket.data.pid as string | undefined;
    if (!code || !pid) return null;
    const sroom = registry.get(code);
    if (!sroom) return null;
    if (!sroom.room.participants.some((p) => p.id === pid)) return null;
    return { sroom, pid };
  }

  /** Take somebody out for good and tell the room what happened. */
  function depart(sroom: ServerRoom, pid: string, reason: "left" | "disconnected"): void {
    const code = sroom.room.code;
    const { handOver, roomEmpty } = registry.removeParticipant(sroom, pid, reason);

    io.to(code).emit("participant:left", { participantId: pid });
    if (handOver) {
      io.to(code).emit("participant:updated", { ...handOver.heir });
      io.to(code).emit("host:changed", {
        participantId: handOver.heir.id,
        previousHostId: handOver.previousHostId,
        reason: handOver.reason,
      });
    }
    limiter.forget(`${code}:${pid}`);
    if (roomEmpty) registry.delete(code);
  }

  io.on("connection", (socket: Sock) => {
    socket.on("room:create", (p, ack) => {
      if (typeof ack !== "function") return;
      if (p?.protocolVersion !== PROTOCOL_VERSION) {
        ack({ ok: false, error: err("PROTOCOL_MISMATCH", "Reload the page.") });
        return;
      }
      const name = String(p.hostName ?? "").trim().slice(0, 40);
      if (!name) {
        ack({ ok: false, error: err("NAME_REQUIRED", "Enter a name to start.") });
        return;
      }
      const mode = p.mode === "song" ? "song" : "jam";
      const size = ["small", "medium", "large"].includes(p.expectedSize)
        ? p.expectedSize
        : "medium";
      const { sroom, you } = registry.createRoom(name, size, mode, socket.id);
      socket.data.code = sroom.room.code;
      socket.data.pid = you.id;
      void socket.join(sroom.room.code);
      ack({
        ok: true,
        data: { room: sroom.room, youId: you.id, serverTime: Date.now() },
      });
    });

    socket.on("room:join", (p, ack) => {
      if (typeof ack !== "function") return;
      if (p?.protocolVersion !== PROTOCOL_VERSION) {
        ack({ ok: false, error: err("PROTOCOL_MISMATCH", "Reload the page.") });
        return;
      }
      const name = String(p.name ?? "").trim().slice(0, 40);
      if (!name) {
        ack({ ok: false, error: err("NAME_REQUIRED", "Enter a name to join.") });
        return;
      }
      const sroom = registry.get(String(p.roomCode ?? ""));
      if (!sroom) {
        ack({ ok: false, error: err("ROOM_NOT_FOUND", "No circle with that code.") });
        return;
      }
      if (sroom.room.phase === "ended") {
        ack({ ok: false, error: err("ROOM_ENDED", "That circle has closed.") });
        return;
      }
      if (sroom.room.participants.length >= ROOM_CAP) {
        ack({ ok: false, error: err("ROOM_FULL", "That circle is full.") });
        return;
      }
      const you = registry.joinRoom(sroom, name, socket.id);
      socket.data.code = sroom.room.code;
      socket.data.pid = you.id;
      void socket.join(sroom.room.code);

      // Arriving after the song was settled: their part is dealt on the spot,
      // instrument included — there is no choosing in song mode.
      const latePart =
        sroom.room.songId !== null ? registry.assignRoleFor(sroom, you.id) : null;

      socket.to(sroom.room.code).emit("participant:joined", { ...you });
      ack({
        ok: true,
        data: { room: sroom.room, youId: you.id, serverTime: Date.now() },
      });
      if (latePart && sroom.room.songId) {
        socket.emit("song:chosen", {
          songId: sroom.room.songId,
          parts: { [you.id]: latePart },
        });
      }
    });

    socket.on("clock:ping", (p, ack) => {
      // Read the clock before anything else. See the header comment.
      const serverTime = Date.now();
      if (typeof ack !== "function") return;
      ack({ t0: Number(p?.t0 ?? 0), serverTime });
    });

    socket.on("instrument:select", (p, ack) => {
      if (typeof ack !== "function") return;
      const here = whereIs(socket);
      if (!here) {
        ack({ ok: false, error: err("ROOM_NOT_FOUND", "Not in a circle.") });
        return;
      }
      const { sroom, pid } = here;
      // In a settled song room instruments are locked: the arrangement dealt
      // them, and asking again returns what you already hold.
      if (sroom.room.songId) {
        const me = sroom.room.participants.find((q) => q.id === pid);
        if (me?.instrumentId) {
          ack({ ok: true, data: { instrumentId: me.instrumentId } });
          return;
        }
      }
      if (p?.instrumentId !== undefined && !getInstrument(p.instrumentId)) {
        ack({ ok: false, error: err("INTERNAL", "Unknown instrument.") });
        return;
      }
      const instrumentId = registry.allocate(sroom, pid, p?.instrumentId);
      const me = sroom.room.participants.find((q) => q.id === pid);
      if (me) io.to(sroom.room.code).emit("participant:updated", { ...me });
      ack({ ok: true, data: { instrumentId } });
    });

    socket.on("song:vote", (p) => {
      const here = whereIs(socket);
      if (!here) return;
      const { sroom, pid } = here;
      const { room } = sroom;
      if (room.mode !== "song" || room.phase !== "gathering") return;
      if (!SONGS.some((s) => s.id === p?.songId)) return;
      room.votes[pid] = p.songId;
      io.to(room.code).emit("song:votes", { votes: { ...room.votes } });
    });

    socket.on("phrase:update", (phrase: Phrase) => {
      const here = whereIs(socket);
      if (!here) return;
      const { sroom, pid } = here;
      const key = `${sroom.room.code}:${pid}`;
      if (!limiter.allow(key)) {
        socket.emit("error", err("RATE_LIMITED", "Too many updates."));
        return;
      }
      const invalid = validatePhrase(phrase, sroom.room);
      if (invalid) {
        socket.emit("error", invalid);
        return;
      }
      // Monotonic revisions: a delayed packet on bad wifi must not resurrect a
      // phrase the player already replaced. A clear resets the floor.
      const last = sroom.revisions.get(pid) ?? -1;
      if (phrase.revision <= last) return;
      sroom.revisions.set(pid, phrase.revision);
      sroom.updateCounts.set(pid, (sroom.updateCounts.get(pid) ?? 0) + 1);
      sroom.room.phrases[pid] = phrase;
      socket.to(sroom.room.code).emit("phrase:changed", { participantId: pid, phrase });
    });

    socket.on("phrase:clear", () => {
      const here = whereIs(socket);
      if (!here) return;
      const { sroom, pid } = here;
      delete sroom.room.phrases[pid];
      sroom.revisions.set(pid, -1);
      socket.to(sroom.room.code).emit("phrase:cleared", { participantId: pid });
    });

    socket.on("transport:update", (p) => {
      const here = whereIs(socket);
      if (!here) return;
      const { sroom, pid } = here;
      const me = sroom.room.participants.find((q) => q.id === pid);
      if (!me?.isHost) {
        socket.emit("error", err("NOT_HOST", "Only the host tends the circle."));
        return;
      }
      const transport = registry.applyTransportUpdate(sroom.room, p ?? {});
      io.to(sroom.room.code).emit("transport:state", transport);
    });

    socket.on("session:begin", () => {
      const here = whereIs(socket);
      if (!here) return;
      const { sroom, pid } = here;
      const me = sroom.room.participants.find((q) => q.id === pid);
      if (!me?.isHost) {
        socket.emit("error", err("NOT_HOST", "Only the host can begin."));
        return;
      }
      if (sroom.room.phase !== "gathering") return;

      const settled = registry.settleSong(sroom);
      if (settled) {
        io.to(sroom.room.code).emit("song:chosen", settled);
        // Instruments were just dealt; let every phone recolour its room.
        for (const participant of sroom.room.participants) {
          io.to(sroom.room.code).emit("participant:updated", { ...participant });
        }
      }

      const transport = registry.begin(sroom);
      io.to(sroom.room.code).emit("session:began", transport);
    });

    socket.on("session:end", () => {
      const here = whereIs(socket);
      if (!here) return;
      const { sroom, pid } = here;
      const me = sroom.room.participants.find((q) => q.id === pid);
      if (!me?.isHost) {
        socket.emit("error", err("NOT_HOST", "Only the host can close the circle."));
        return;
      }
      if (sroom.room.phase === "ended") return;
      sroom.room.phase = "ended";
      sroom.room.endedAt = Date.now();

      // Per recipient, because `you` differs for each socket.
      for (const participant of sroom.room.participants) {
        const socketId = sroom.sockets.get(participant.id);
        if (!socketId) continue;
        io.to(socketId).emit("session:ended", buildSummary(sroom, participant.id));
      }
      const timer = setTimeout(() => registry.delete(sroom.room.code), roomLingerMs);
      unrefSafe(timer);
    });

    socket.on("room:leave", () => {
      const here = whereIs(socket);
      if (!here) return;
      depart(here.sroom, here.pid, "left");
      socket.data.code = undefined;
      socket.data.pid = undefined;
    });

    socket.on("disconnect", () => {
      const here = whereIs(socket);
      if (!here) return;
      const { sroom, pid } = here;
      const me = sroom.room.participants.find((q) => q.id === pid);
      if (!me) return;

      // Present, not absent: they keep their seat, their phrase and — if they
      // are hosting — the circle, for the length of the grace period.
      me.connected = false;
      sroom.sockets.delete(pid);
      io.to(sroom.room.code).emit("participant:updated", { ...me });

      const timer = setTimeout(() => {
        sroom.disconnectTimers.delete(pid);
        // Still gone when the grace runs out? Now they have left.
        if (!sroom.sockets.has(pid)) depart(sroom, pid, "disconnected");
      }, disconnectGraceMs);
      unrefSafe(timer);
      sroom.disconnectTimers.set(pid, timer);
    });
  });

  // Sweep away rooms nobody will come back to.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const sroom of registry.all()) {
      const { room } = sroom;
      const dead =
        (room.phase === "ended" && (room.endedAt ?? 0) + roomLingerMs < now) ||
        (sroom.sockets.size === 0 &&
          room.createdAt + roomLingerMs < now);
      if (dead) registry.delete(room.code);
    }
  }, expirySweepMs);
  unrefSafe(sweep);

  return {
    registry,
    close() {
      clearInterval(sweep);
      for (const sroom of registry.all()) registry.delete(sroom.room.code);
    },
  };
}
