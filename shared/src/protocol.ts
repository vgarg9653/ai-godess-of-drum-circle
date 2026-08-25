/**
 * Wire protocol between the phones and the Node/Socket.IO server.
 *
 * This file is the contract. Frontend and backend both import it, so a change
 * here is a compile error on whichever side has not caught up yet. Add fields
 * optionally; never repurpose an existing one.
 */

import type { HostChangeReason } from "./hosting.js";
import type { GroupSize } from "./instruments.js";
import type { MoodId } from "./music.js";

export const PROTOCOL_VERSION = 3;

/* ------------------------------------------------------------------ *
 * Entities
 * ------------------------------------------------------------------ */

/**
 * How a stroke was made.
 *
 * Three, and only three, for every instrument in the roster. The play surface
 * is one circle, not a keyboard: touch the outer ring, touch the middle, or
 * sweep across. A drum reads those as open / muted / roll; a flute reads them
 * as short / soft / glide. The player learns one vocabulary and it transfers to
 * every instrument they might be handed.
 */
export type Stroke = "outer" | "center" | "sweep";

/** A single struck or sustained event inside a looping phrase. */
export interface Onset {
  /** Grid position within the cycle. 0 <= step < cycleBeats * STEPS_PER_BEAT. */
  step: number;
  /** 0..1. Derived from the stroke, not from raw touch force. */
  velocity: number;
  stroke: Stroke;
  /**
   * Scale degree for pitched instruments, chosen by the engine rather than the
   * player — see `degreeForOnset`. Carried on the wire so every device renders
   * and (when monitoring) sounds the same phrase.
   */
  degree?: number;
  /** Length in grid steps, for sustained voices. */
  durSteps?: number;
}

/**
 * One participant's looping contribution.
 *
 * `revision` increments on every local edit. The server keeps the highest
 * revision it has seen per participant and drops anything older, so a delayed
 * packet on bad wifi cannot resurrect a phrase the player already cleared.
 */
export interface Phrase {
  instrumentId: string;
  onsets: Onset[];
  revision: number;
}

export interface Participant {
  id: string;
  name: string;
  instrumentId: string | null;
  /**
   * Which part of the arrangement this person plays. Null in a jam room, and
   * null in a song room until the song has been chosen.
   *
   * The *pattern* is not sent: the client already has every arrangement, so
   * `songId` plus `roleId` plus the slice index is enough to derive it. That
   * also keeps cue state entirely on the phone, where it belongs — it is nobody
   * else's business how long someone took to find their part.
   */
  roleId: string | null;
  /** Position within the role, which decides which hits are this person's. */
  rolePart: number;
  isHost: boolean;
  /** Server time (ms) the participant joined. Used for the personal summary. */
  joinedAt: number;
  /**
   * Present but silent is a valid, respected state — the brief is explicit that
   * people who stop playing are shown as present, never as absent or inactive.
   */
  connected: boolean;
}

/**
 * Shared timing reference. Every device derives its own audio clock from this.
 *
 * `startedAt` is server epoch ms for cycle 0, step 0. Combined with the client's
 * measured clock offset it is the entire basis of cross-device sync.
 */
export interface TransportState {
  bpm: number;
  cycleBeats: number;
  moodId: MoodId;
  /**
   * Root note override, in MIDI numbers.
   *
   * Moods carry their own root, which is enough for a free jam. A song may be in
   * a key none of the three moods supplies, so it can override this and keep the
   * mood's *scale* while moving where it sits.
   */
  rootMidi?: number;
  startedAt: number;
  /** Bumped on every transport change so clients can ignore stale updates. */
  revision: number;
}

/**
 * Where the room is in its life.
 *
 * `gathering` is the lobby: people have joined and taken instruments but no
 * sound is being made yet, so the host can wait for stragglers without an
 * awkward half-empty groove already running.
 */
export type RoomPhase = "gathering" | "playing" | "ended";

/**
 * What kind of session this is.
 *
 * `jam` is the open circle: everyone lays down whatever they like.
 * `song` starts from an arrangement — the room votes, and its tempo, key and
 * mood come from the piece, with each person cued into a part. Cues fade
 * person by person, and once everyone is released a song room simply *is* a jam
 * room, in the world of that piece. The mode never flips back.
 */
export type RoomMode = "jam" | "song";

export interface Room {
  code: string;
  phase: RoomPhase;
  mode: RoomMode;
  /** Chosen arrangement, once the room has voted. Null in a jam room. */
  songId: string | null;
  /**
   * Who voted for what, keyed by participant id.
   *
   * Sent as raw votes rather than a tally so the lobby can show the count
   * changing as people decide, and so a leaver's vote can be removed exactly.
   */
  votes: Record<string, string>;
  expectedSize: GroupSize;
  transport: TransportState;
  participants: Participant[];
  /** Keyed by participant id. */
  phrases: Record<string, Phrase>;
  createdAt: number;
  endedAt: number | null;
}

/**
 * Personal, non-comparative close-out.
 *
 * The brief forbids ranking or comparison between people, so this carries only
 * the viewer's own numbers plus room-wide totals that belong to everyone.
 */
export interface SessionSummary {
  roomCode: string;
  durationMs: number;
  participantCount: number;
  /** The viewer's own figures. Never another participant's. */
  you: {
    instrumentId: string | null;
    presentMs: number;
    /** Distinct grid positions the participant filled over the session. */
    onsetsPlayed: number;
    /** Number of times they revised their phrase. A curiosity measure. */
    revisions: number;
  };
  /** Belongs to the whole room, so it is safe to show without ranking anyone. */
  room: {
    totalOnsets: number;
    instrumentsUsed: string[];
    cyclesCompleted: number;
    /** Everyone who was there, so the closing screen can name them. */
    roster: Array<{ name: string; instrumentId: string | null }>;
    /**
     * When each family sounded across the cycle, summed over everyone in it.
     * Keyed by family; each array is one entry per grid step.
     *
     * Deliberately aggregated by family and not by person: it shows the room
     * the shape it wove together without letting anyone count another
     * participant's contribution, which the brief forbids.
     */
    weave: Record<string, number[]>;
  };
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_ENDED"
  | "NAME_REQUIRED"
  | "NOT_HOST"
  | "INVALID_PHRASE"
  | "RATE_LIMITED"
  | "PROTOCOL_MISMATCH"
  | "INTERNAL";

export interface ProtocolError {
  code: ErrorCode;
  message: string;
}

/** Every ack in this protocol is a discriminated result, never a bare throw. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: ProtocolError };

/* ------------------------------------------------------------------ *
 * Client -> Server
 * ------------------------------------------------------------------ */

export interface CreateRoomPayload {
  hostName: string;
  expectedSize: GroupSize;
  mode: RoomMode;
  protocolVersion: number;
}

export interface JoinRoomPayload {
  roomCode: string;
  name: string;
  protocolVersion: number;
}

export interface JoinResult {
  room: Room;
  /** The participant id assigned to this socket. */
  youId: string;
  /** Server epoch ms at the moment of the reply, to seed clock sync. */
  serverTime: number;
}

export interface ClockPingPayload {
  /** Client epoch ms at send. Echoed back untouched. */
  t0: number;
}

export interface ClockPongPayload {
  t0: number;
  /** Server epoch ms when the ping was handled. */
  serverTime: number;
}

export interface SelectInstrumentPayload {
  /** Omit to let the server auto-allocate for a balanced room. */
  instrumentId?: string;
}

export interface UpdateTransportPayload {
  bpm?: number;
  cycleBeats?: number;
  moodId?: MoodId;
}

/**
 * Events the phone sends.
 *
 * Note the ack callbacks: create/join/instrument selection are request-response
 * because the client cannot proceed without the server's answer, while phrase
 * updates are fire-and-forget so a slow ack never stalls playing.
 */
export interface ClientToServerEvents {
  "room:create": (p: CreateRoomPayload, ack: (r: Ack<JoinResult>) => void) => void;
  "room:join": (p: JoinRoomPayload, ack: (r: Ack<JoinResult>) => void) => void;
  "room:leave": () => void;

  "clock:ping": (p: ClockPingPayload, ack: (r: ClockPongPayload) => void) => void;

  "instrument:select": (
    p: SelectInstrumentPayload,
    ack: (r: Ack<{ instrumentId: string }>) => void,
  ) => void;

  "phrase:update": (p: Phrase) => void;
  "phrase:clear": () => void;

  /**
   * Cast or change this participant's vote for a song. Lobby only.
   *
   * Anyone may vote and may change their mind; the last vote per person counts.
   */
  "song:vote": (p: { songId: string }) => void;

  /** Host only. Server rejects with NOT_HOST otherwise. */
  "transport:update": (p: UpdateTransportPayload) => void;
  /** Host only. Moves the room from `gathering` to `playing`. */
  "session:begin": () => void;
  "session:end": () => void;
}

/* ------------------------------------------------------------------ *
 * Server -> Client
 * ------------------------------------------------------------------ */

export interface ServerToClientEvents {
  /** Full snapshot. Sent on join and after any reconnect. */
  "room:state": (room: Room) => void;

  "participant:joined": (p: Participant) => void;
  "participant:updated": (p: Participant) => void;
  /** Fired when a participant leaves for good, not when they merely fall silent. */
  "participant:left": (payload: { participantId: string }) => void;

  "transport:state": (t: TransportState) => void;

  "phrase:changed": (payload: { participantId: string; phrase: Phrase }) => void;
  "phrase:cleared": (payload: { participantId: string }) => void;

  /**
   * The circle changed hands.
   *
   * Sent when the host leaves for good, so the room is never left without
   * anyone able to close it. Both participants' `isHost` flags are also updated
   * via `participant:updated`; this event exists so the new host can be *told*,
   * rather than noticing that controls silently appeared.
   */
  "host:changed": (payload: {
    participantId: string;
    previousHostId: string;
    reason: HostChangeReason;
  }) => void;

  /** The lobby's votes changed. Keyed by participant id. */
  "song:votes": (payload: { votes: Record<string, string> }) => void;

  /**
   * The song is settled and parts are handed out.
   *
   * Sent on `session:begin` in a song room, immediately before `session:began`,
   * so every phone knows its role before the first bar sounds.
   */
  "song:chosen": (payload: {
    songId: string;
    /** Role and slice per participant id. */
    parts: Record<string, { roleId: string; rolePart: number }>;
  }) => void;

  /** The host pressed Begin. Carries the transport with its final `startedAt`. */
  "session:began": (t: TransportState) => void;
  "session:ended": (summary: SessionSummary) => void;

  "error": (e: ProtocolError) => void;
}
