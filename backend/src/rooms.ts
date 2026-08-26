/**
 * The room registry.
 *
 * Owns every room's state and the rules for changing it. Knows nothing about
 * sockets — server.ts wires this to Socket.IO and does the emitting, which
 * keeps the state logic testable without a network.
 *
 * All musical decisions are delegated to @godc/shared: allocation, role
 * assignment, host succession, the winning-song rule. The server must compute
 * the same answers as every phone, and the only reliable way to do that is to
 * run the same code.
 */

import {
  BPM_MAX,
  BPM_MIN,
  CYCLE_OPTIONS,
  MOODS,
  SONGS,
  allocateInstrument,
  assignRole,
  getSong,
  instrumentForSeat,
  memberIndexFor,
  nextHost,
  type GroupSize,
  type HostChangeReason,
  type Participant,
  type Room,
  type RoomMode,
  type TransportState,
  type UpdateTransportPayload,
} from "@godc/shared";

/** Hard cap on one room. The brief's largest case is "30+", read as up to 80. */
export const ROOM_CAP = 80;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface ServerRoom {
  room: Room;
  /** participantId -> live socket id. Absent while disconnected. */
  sockets: Map<string, string>;
  /** Last accepted phrase revision per participant. -1 after a clear. */
  revisions: Map<string, number>;
  /** Accepted phrase updates per participant, for the closing summary. */
  updateCounts: Map<string, number>;
  /** Grace timers for participants whose socket dropped. */
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Transport origin at the moment the host pressed Begin. */
  playStartedAt: number | null;
}

export interface HostHandOver {
  heir: Participant;
  previousHostId: string;
  reason: HostChangeReason;
}

export class RoomRegistry {
  private rooms = new Map<string, ServerRoom>();
  private nextId = 1;

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): ServerRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Every room, for the expiry sweep. */
  all(): ServerRoom[] {
    return [...this.rooms.values()];
  }

  delete(code: string): void {
    const sroom = this.rooms.get(code);
    if (!sroom) return;
    for (const timer of sroom.disconnectTimers.values()) clearTimeout(timer);
    this.rooms.delete(code);
  }

  private makeCode(): string {
    // 31^4 ≈ 900k codes; retry a few times rather than reasoning about it.
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = "";
      for (let i = 0; i < 4; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("code space exhausted");
  }

  createRoom(
    hostName: string,
    expectedSize: GroupSize,
    mode: RoomMode,
    socketId: string,
  ): { sroom: ServerRoom; you: Participant } {
    const now = Date.now();
    const you: Participant = {
      id: `p${this.nextId++}`,
      name: hostName,
      instrumentId: null,
      roleId: null,
      rolePart: 0,
      isHost: true,
      joinedAt: now,
      connected: true,
    };
    const room: Room = {
      code: this.makeCode(),
      phase: "gathering",
      mode,
      songId: null,
      votes: {},
      expectedSize,
      transport: {
        bpm: 90,
        cycleBeats: 8,
        moodId: "monsoon",
        // Placeholder until Begin re-origins it; a whole second in the near
        // future so an early-started client is not mid-bar.
        startedAt: Math.ceil((now + 1500) / 1000) * 1000,
        revision: 1,
      },
      participants: [you],
      phrases: {},
      createdAt: now,
      endedAt: null,
    };
    const sroom: ServerRoom = {
      room,
      sockets: new Map([[you.id, socketId]]),
      revisions: new Map(),
      updateCounts: new Map(),
      disconnectTimers: new Map(),
      playStartedAt: null,
    };
    this.rooms.set(room.code, sroom);
    return { sroom, you };
  }

  joinRoom(
    sroom: ServerRoom,
    name: string,
    socketId: string,
  ): Participant {
    const you: Participant = {
      id: `p${this.nextId++}`,
      name,
      instrumentId: null,
      roleId: null,
      rolePart: 0,
      isHost: false,
      joinedAt: Date.now(),
      connected: true,
    };
    sroom.room.participants.push(you);
    sroom.sockets.set(you.id, socketId);
    return you;
  }

  /**
   * Hand this person an instrument, keeping the room's range balanced.
   * Uses the shared allocator so client previews and server answers agree.
   */
  allocate(sroom: ServerRoom, participantId: string, requestedId?: string): string {
    const taken = sroom.room.participants
      .filter((p) => p.id !== participantId && p.instrumentId !== null)
      .map((p) => p.instrumentId as string);
    const chosen = requestedId ?? allocateInstrument(taken, sroom.room.expectedSize).id;
    const me = sroom.room.participants.find((p) => p.id === participantId);
    if (me) me.instrumentId = chosen;
    return chosen;
  }

  /**
   * Which piece the room chose. Most votes wins; catalogue order breaks ties;
   * an empty ballot falls back to the first piece — a room that will not begin
   * is worse than one that begins with the easy one.
   */
  winningSong(room: Room): string {
    const tally = new Map<string, number>();
    for (const songId of Object.values(room.votes)) {
      tally.set(songId, (tally.get(songId) ?? 0) + 1);
    }
    let best = SONGS[0].id;
    let most = -1;
    for (const song of SONGS) {
      const n = tally.get(song.id) ?? 0;
      if (n > most) {
        most = n;
        best = song.id;
      }
    }
    return best;
  }

  /**
   * Deal one person their part: role by ratio, instrument locked to the role.
   * Used at Begin for the whole room in join order, and again for anyone
   * arriving late. The arrangement dictates the instrument, the way a
   * bandleader hands out parts — nobody chooses.
   */
  assignRoleFor(
    sroom: ServerRoom,
    participantId: string,
  ): { roleId: string; rolePart: number; instrumentId: string } | null {
    const { room } = sroom;
    if (!room.songId) return null;
    const song = getSong(room.songId);
    if (!song) return null;

    const me = room.participants.find((p) => p.id === participantId);
    if (!me) return null;
    const taken = room.participants
      .filter((p) => p.id !== participantId && p.roleId !== null)
      .map((p) => p.roleId as string);
    const role = assignRole(song, taken);
    me.roleId = role.id;
    me.rolePart = memberIndexFor(taken, role.id);
    me.instrumentId = instrumentForSeat(role, me.rolePart);
    return { roleId: role.id, rolePart: me.rolePart, instrumentId: me.instrumentId };
  }

  /**
   * Settle the song and hand out every part. Called once, at Begin.
   * Returns the parts map for the `song:chosen` broadcast.
   */
  settleSong(sroom: ServerRoom): {
    songId: string;
    parts: Record<string, { roleId: string; rolePart: number; instrumentId: string }>;
  } | null {
    const { room } = sroom;
    if (room.mode !== "song" || room.songId) return null;
    const songId = this.winningSong(room);
    const song = getSong(songId);
    if (!song) return null;
    room.songId = songId;

    // The piece sets the room's tempo, metre, mood and key.
    room.transport = {
      ...room.transport,
      bpm: song.bpm,
      cycleBeats: song.cycleBeats,
      moodId: song.moodId,
      ...(song.rootMidi !== undefined ? { rootMidi: song.rootMidi } : {}),
      revision: room.transport.revision + 1,
    };

    const parts: Record<string, { roleId: string; rolePart: number; instrumentId: string }> = {};
    for (const participant of room.participants) {
      const part = this.assignRoleFor(sroom, participant.id);
      if (part) parts[participant.id] = part;
    }
    return { songId, parts };
  }

  /**
   * Merge a host's transport change. Never touches startedAt — and in a room
   * playing a song, never the metre either: refitting everyone's dealt part
   * into a different cycle would dismantle the arrangement.
   */
  applyTransportUpdate(room: Room, p: UpdateTransportPayload): TransportState {
    const next = { ...room.transport };
    if (p.bpm !== undefined && Number.isFinite(p.bpm)) {
      next.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, p.bpm));
    }
    if (
      p.cycleBeats !== undefined &&
      room.songId === null &&
      CYCLE_OPTIONS.some((o) => o.beats === p.cycleBeats)
    ) {
      next.cycleBeats = p.cycleBeats;
    }
    if (p.moodId !== undefined && MOODS.some((m) => m.id === p.moodId)) {
      next.moodId = p.moodId;
    }
    next.revision += 1;
    room.transport = next;
    return next;
  }

  /** Move the room into play. Re-origins the shared clock — the one legal move. */
  begin(sroom: ServerRoom): TransportState {
    const { room } = sroom;
    room.phase = "playing";
    room.transport = {
      ...room.transport,
      startedAt: Math.ceil((Date.now() + 1200) / 1000) * 1000,
      revision: room.transport.revision + 1,
    };
    sroom.playStartedAt = room.transport.startedAt;
    return room.transport;
  }

  /**
   * Remove a participant for good and, if they were tending the circle, pass
   * it on. Returns what happened so the caller can tell the room.
   */
  removeParticipant(
    sroom: ServerRoom,
    participantId: string,
    reason: HostChangeReason,
  ): { wasHost: boolean; handOver: HostHandOver | null; roomEmpty: boolean } {
    const { room } = sroom;
    const leaving = room.participants.find((p) => p.id === participantId);
    if (!leaving) return { wasHost: false, handOver: null, roomEmpty: room.participants.length === 0 };

    const wasHost = leaving.isHost;
    let handOver: HostHandOver | null = null;

    if (wasHost && room.phase !== "ended") {
      const heir = nextHost(room.participants, participantId);
      if (heir) {
        heir.isHost = true;
        handOver = { heir, previousHostId: participantId, reason };
      } else {
        // Nobody eligible is left to hold it. The room is simply over.
        room.phase = "ended";
        room.endedAt = Date.now();
      }
    }

    room.participants = room.participants.filter((p) => p.id !== participantId);
    delete room.phrases[participantId];
    delete room.votes[participantId];
    sroom.sockets.delete(participantId);
    sroom.revisions.delete(participantId);
    sroom.updateCounts.delete(participantId);
    const timer = sroom.disconnectTimers.get(participantId);
    if (timer) clearTimeout(timer);
    sroom.disconnectTimers.delete(participantId);

    return { wasHost, handOver, roomEmpty: room.participants.length === 0 };
  }
}
