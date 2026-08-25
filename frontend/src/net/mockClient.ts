/**
 * In-browser mock server.
 *
 * Lets the whole app run — join, allocate, play, presence, summary — with no
 * backend at all. It also seeds synthetic participants so the presence view has
 * something to show on a single laptop.
 *
 * It deliberately reports a server clock skewed from this device's, because a
 * mock that pretends both clocks agree would hide the exact class of bug the
 * shared clock exists to prevent.
 */

import {
  BPM_DEFAULT,
  CYCLE_BEATS_DEFAULT,
  MOOD_DEFAULT,
  PROTOCOL_VERSION,
  allocateInstrument,
  assignRole,
  degreeForOnset,
  distributeRole,
  getSong,
  memberIndexFor,
  nextHost,
  SONGS,
  getInstrument,
  gridSteps,
  maxOnsets,
  type Ack,
  type ClockPongPayload,
  type CreateRoomPayload,
  type JoinResult,
  type JoinRoomPayload,
  type Participant,
  type Phrase,
  type Room,
  type SelectInstrumentPayload,
  type ServerToClientEvents,
  type HostChangeReason,
  type SessionSummary,
  type Stroke,
  type UpdateTransportPayload,
} from "@godc/shared";
import type { RoomClient, Unsubscribe } from "./RoomClient";

/** Pretend the server's clock sits a few hundred ms away from ours. */
const FAKE_SKEW_MS = 437;
/** Pretend the network costs something. */
const FAKE_LATENCY_MS = 35;

const FAKE_NAMES = [
  "Asha", "Ravi", "Mira", "Kofi", "Lena", "Tomás",
  "Ingrid", "Devi", "Sam", "Yuki", "Nadia", "Oren",
];

function delay<T>(value: T, ms = FAKE_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function serverNow(): number {
  return Date.now() + FAKE_SKEW_MS;
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** A plausible loop for a synthetic player, respecting the density cap. */
function generatePhrase(
  instrumentId: string,
  cycleBeats: number,
  participantCount: number,
  seed: number,
): Phrase {
  const instrument = getInstrument(instrumentId);
  const steps = gridSteps(cycleBeats);
  const cap = maxOnsets(participantCount, cycleBeats);
  // Sustaining voices place fewer, longer events; drums fill more of the grid.
  const count = Math.max(2, Math.round(cap * (instrument?.sustains ? 0.3 : 0.6)));

  const chosen = new Set<number>();
  // Favour beat-aligned positions so the mock room sounds like a room.
  while (chosen.size < count) {
    const onBeat = Math.random() < 0.7;
    const step = onBeat
      ? Math.floor(Math.random() * cycleBeats) * 4
      : Math.floor(Math.random() * steps);
    chosen.add(step % steps);
  }

  const strokes: Stroke[] = ["outer", "center", "sweep"];
  return {
    instrumentId,
    revision: 1,
    onsets: [...chosen].map((step) => {
      const r = Math.random();
      const stroke = r < 0.6 ? strokes[0] : r < 0.9 ? strokes[1] : strokes[2];
      return {
        step,
        velocity: 0.6 + Math.random() * 0.3,
        stroke,
        degree: degreeForOnset(seed, step),
        ...(instrument?.sustains ? { durSteps: stroke === "sweep" ? 8 : 4 } : {}),
      };
    }),
  };
}

/**
 * Handlers are stored type-erased. TypeScript cannot prove a lookup by a
 * generic key yields the matching signature, and the on()/emit() boundary
 * already enforces it, so the erasure is contained to these two methods.
 */
type AnyHandler = (...args: never[]) => void;

export interface MockOptions {
  /** How many synthetic participants to seed alongside the real one. */
  fakeParticipants?: number;
  /**
   * Have the synthetic host walk out shortly after the session starts, so host
   * transfer can be seen without a backend or a second browser.
   *
   * Off by default — it would be baffling behaviour for anyone just trying the
   * app. Flip it on in `makeClient()` when working on the hand-over.
   */
  simulateHostDeparture?: boolean;
}

export class MockRoomClient implements RoomClient {
  private handlers = new Map<keyof ServerToClientEvents, Set<AnyHandler>>();
  private room: Room | null = null;
  private youId = "you";
  private revisions = 0;
  private churnTimer: ReturnType<typeof setInterval> | null = null;
  /** When the host actually pressed Begin, for an honest session length. */
  private playStartedAt: number | null = null;
  private autoBeginTimer: ReturnType<typeof setTimeout> | null = null;
  private departureTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: MockOptions = {}) {}

  async connect(): Promise<void> {
    await delay(undefined, 80);
  }

  disconnect(): void {
    if (this.churnTimer !== null) {
      clearInterval(this.churnTimer);
      this.churnTimer = null;
    }
    if (this.autoBeginTimer !== null) clearTimeout(this.autoBeginTimer);
    if (this.departureTimer !== null) clearTimeout(this.departureTimer);
    this.autoBeginTimer = null;
    this.departureTimer = null;

    // Leaving a live room you were tending should hand it on, not orphan it.
    const room = this.room;
    if (room && room.phase !== "ended") {
      const you = room.participants.find((p) => p.id === this.youId);
      if (you?.isHost) this.handOver(this.youId, "left");
    }

    this.handlers.clear();
    this.room = null;
  }

  /**
   * Pass the circle to whoever has been here longest.
   *
   * Uses the shared `nextHost` rule rather than its own, so the mock cannot
   * quietly disagree with the real server about who inherits.
   */
  private handOver(departingId: string, reason: HostChangeReason): void {
    const room = this.room;
    if (!room) return;
    const heir = nextHost(room.participants, departingId);
    if (!heir) {
      // Nobody left to hold it. An empty room is simply over.
      room.phase = "ended";
      return;
    }
    for (const participant of room.participants) {
      if (participant.id === heir.id) participant.isHost = true;
      if (participant.id === departingId) participant.isHost = false;
    }
    this.emit("participant:updated", { ...heir, isHost: true });
    this.emit("host:changed", {
      participantId: heir.id,
      previousHostId: departingId,
      reason,
    });
  }

  private emit<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }

  on<E extends keyof ServerToClientEvents>(
    event: E,
    handler: ServerToClientEvents[E],
  ): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as AnyHandler);
    return () => {
      set.delete(handler as AnyHandler);
    };
  }

  /* ---------------- room lifecycle ---------------- */

  private buildRoom(p: CreateRoomPayload | JoinRoomPayload, isHost: boolean): Room {
    const now = serverNow();
    const expectedSize = "expectedSize" in p ? p.expectedSize : "medium";
    const name = "hostName" in p ? p.hostName : p.name;

    const you: Participant = {
      id: this.youId,
      name,
      instrumentId: null,
      roleId: null,
      rolePart: 0,
      isHost,
      joinedAt: now,
      connected: true,
    };

    const room: Room = {
      code: "roomCode" in p ? p.roomCode.toUpperCase() : makeCode(),
      phase: "gathering",
      mode: "mode" in p ? p.mode : "jam",
      songId: null,
      votes: {},
      expectedSize,
      transport: {
        bpm: BPM_DEFAULT,
        cycleBeats: CYCLE_BEATS_DEFAULT,
        moodId: MOOD_DEFAULT,
        // Start on a whole second in the near future so the first cycle is not
        // already half over by the time the player reaches the play screen.
        startedAt: Math.ceil((now + 1500) / 1000) * 1000,
        revision: 1,
      },
      participants: [you],
      phrases: {},
      createdAt: now,
      endedAt: null,
    };

    this.seedFakes(room);

    if (room.mode === "song") {
      // Synthetic participants have opinions. Spread them over a few pieces so
      // the tally is worth looking at rather than unanimous.
      const shortlist = SONGS.slice(0, 4);
      room.participants
        .filter((q) => q.id !== this.youId)
        .forEach((q, i) => {
          room.votes[q.id] = shortlist[i % shortlist.length].id;
        });
    }

    if (!isHost) {
      // Someone opened this circle before you arrived. Without a host among the
      // synthetic participants, a joined room would sit in the lobby forever.
      const others = room.participants.filter((p) => p.id !== this.youId);
      const opener = others[0];
      if (opener) {
        opener.isHost = true;
        // Whoever opened the circle got here first, by definition.
        opener.joinedAt = Math.min(...others.map((p) => p.joinedAt)) - 60_000;
      }
    }

    return room;
  }

  private seedFakes(room: Room): void {
    const count = this.options.fakeParticipants ?? 4;
    for (let i = 0; i < count; i++) {
      const taken = room.participants
        .map((p) => p.instrumentId)
        .filter((id): id is string => id !== null);
      const instrument = allocateInstrument(taken, room.expectedSize);
      const id = `mock-${i}`;
      room.participants.push({
        id,
        name: FAKE_NAMES[i % FAKE_NAMES.length],
        instrumentId: instrument.id,
        roleId: null,
        rolePart: 0,
        isHost: false,
        // Stagger arrivals across the last few minutes. Everyone sharing a
        // millisecond is not just unrealistic — it makes "longest-present"
        // meaningless and sends host transfer down its tie-break path.
        joinedAt: room.createdAt - (count - i) * 40_000,
        connected: true,
      });
      room.phrases[id] = generatePhrase(
        instrument.id,
        room.transport.cycleBeats,
        count + 1,
        i * 7919 + 13,
      );
    }
  }

  /** Synthetic players occasionally rewrite their loop, as real ones do. */
  private startChurn(): void {
    if (this.churnTimer !== null) return;
    this.churnTimer = setInterval(() => {
      const room = this.room;
      if (!room || room.endedAt !== null) return;
      const fakes = room.participants.filter((p) => p.id.startsWith("mock-"));
      if (fakes.length === 0) return;
      // In a song room the parts are the arrangement; do not churn them.
      if (room.mode === "song" && room.songId) return;
      const target = fakes[Math.floor(Math.random() * fakes.length)];
      if (!target.instrumentId) return;
      const phrase = generatePhrase(
        target.instrumentId,
        room.transport.cycleBeats,
        room.participants.length,
        target.id.charCodeAt(target.id.length - 1) * 7919,
      );
      room.phrases[target.id] = phrase;
      this.emit("phrase:changed", { participantId: target.id, phrase });
    }, 9000);
  }

  /** The synthetic host presses Begin, so a joiner is not stranded. */
  private scheduleAutoBegin(): void {
    if (this.autoBeginTimer !== null) return;
    this.autoBeginTimer = setTimeout(() => {
      this.autoBeginTimer = null;
      const room = this.room;
      if (!room || room.phase !== "gathering") return;
      const you = room.participants.find((p) => p.id === this.youId);
      if (you?.isHost) return;
      this.beginSession();
    }, 6000);
  }

  private joinResult(): Ack<JoinResult> {
    return {
      ok: true,
      data: { room: this.room!, youId: this.youId, serverTime: serverNow() },
    };
  }

  async createRoom(p: CreateRoomPayload): Promise<Ack<JoinResult>> {
    if (p.protocolVersion !== PROTOCOL_VERSION) {
      return delay({
        ok: false as const,
        error: { code: "PROTOCOL_MISMATCH" as const, message: "Reload the page." },
      });
    }
    this.room = this.buildRoom(p, true);
    this.startChurn();
    return delay(this.joinResult());
  }

  async joinRoom(p: JoinRoomPayload): Promise<Ack<JoinResult>> {
    if (!p.name.trim()) {
      return delay({
        ok: false as const,
        error: { code: "NAME_REQUIRED" as const, message: "Enter a name to join." },
      });
    }
    this.room = this.buildRoom(p, false);
    this.startChurn();
    this.scheduleAutoBegin();
    return delay(this.joinResult());
  }

  async ping(t0: number): Promise<ClockPongPayload> {
    return delay({ t0, serverTime: serverNow() }, FAKE_LATENCY_MS / 2);
  }

  async selectInstrument(
    p: SelectInstrumentPayload,
  ): Promise<Ack<{ instrumentId: string }>> {
    const room = this.room;
    if (!room) {
      return delay({
        ok: false as const,
        error: { code: "ROOM_NOT_FOUND" as const, message: "No room." },
      });
    }

    const taken = room.participants
      .filter((participant) => participant.id !== this.youId)
      .map((participant) => participant.instrumentId)
      .filter((id): id is string => id !== null);

    const instrumentId =
      p.instrumentId ?? allocateInstrument(taken, room.expectedSize).id;

    const you = room.participants.find((participant) => participant.id === this.youId);
    if (you) {
      you.instrumentId = instrumentId;
      this.emit("participant:updated", you);
    }
    return delay({ ok: true as const, data: { instrumentId } });
  }

  updatePhrase(phrase: Phrase): void {
    if (!this.room) return;
    this.revisions += 1;
    this.room.phrases[this.youId] = phrase;
  }

  clearPhrase(): void {
    if (!this.room) return;
    delete this.room.phrases[this.youId];
  }

  voteSong(songId: string): void {
    const room = this.room;
    if (!room || room.phase !== "gathering") return;
    room.votes[this.youId] = songId;
    this.emit("song:votes", { votes: { ...room.votes } });
  }

  /**
   * Which piece the room chose.
   *
   * Most votes wins; catalogue order breaks a tie so every device lands on the
   * same answer. An empty lobby falls back to the first piece rather than
   * refusing to start — a room that will not begin is worse than one that
   * begins with the easy one.
   */
  private winningSong(room: Room): string {
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

  updateTransport(p: UpdateTransportPayload): void {
    const room = this.room;
    if (!room) return;
    const next = {
      ...room.transport,
      ...p,
      revision: room.transport.revision + 1,
    };
    room.transport = next;
    this.emit("transport:state", next);
  }

  beginSession(): void {
    const room = this.room;
    if (!room) return;

    if (room.mode === "song" && !room.songId) {
      const songId = this.winningSong(room);
      const song = getSong(songId);
      if (song) {
        room.songId = songId;

        // Roles are fitted to the instrument each person already chose and
        // previewed, not the other way round.
        const takenRoleIds: string[] = [];
        const parts: Record<string, { roleId: string; rolePart: number }> = {};
        for (const participant of room.participants) {
          const instrument = participant.instrumentId
            ? getInstrument(participant.instrumentId)
            : undefined;
          const role = assignRole(song, takenRoleIds, instrument?.family);
          participant.roleId = role.id;
          participant.rolePart = memberIndexFor(takenRoleIds, role.id);
          parts[participant.id] = { roleId: role.id, rolePart: participant.rolePart };
          takenRoleIds.push(role.id);
        }

        // The piece sets the room's tempo, metre, mood and key.
        room.transport = {
          ...room.transport,
          bpm: song.bpm,
          cycleBeats: song.cycleBeats,
          moodId: song.moodId,
          ...(song.rootMidi !== undefined ? { rootMidi: song.rootMidi } : {}),
        };

        // Everyone else's loop is their share of the arrangement, so the room
        // sounds like the piece from the first bar.
        const members = (roleId: string) =>
          room.participants.filter((q) => q.roleId === roleId).length;
        for (const participant of room.participants) {
          if (participant.id === this.youId || !participant.roleId) continue;
          const role = song.roles.find((r) => r.id === participant.roleId);
          if (!role) continue;
          room.phrases[participant.id] = {
            instrumentId: participant.instrumentId ?? "tabla",
            revision: 1,
            onsets: distributeRole(
              role,
              participant.rolePart,
              members(participant.roleId),
              room.participants.length,
              song.cycleBeats,
            ),
          };
        }

        this.emit("song:chosen", { songId, parts });
        this.emit("room:state", { ...room });
      }
    }

    room.phase = "playing";
    // Re-origin the transport on a whole second in the near future, so cycle
    // zero starts cleanly rather than halfway through a bar.
    room.transport = {
      ...room.transport,
      startedAt: Math.ceil((serverNow() + 1200) / 1000) * 1000,
      revision: room.transport.revision + 1,
    };
    this.playStartedAt = room.transport.startedAt;
    this.emit("session:began", room.transport);

    if (this.options.simulateHostDeparture) {
      const host = room.participants.find((p) => p.isHost && p.id !== this.youId);
      if (host && this.departureTimer === null) {
        this.departureTimer = setTimeout(() => {
          this.departureTimer = null;
          const live = this.room;
          if (!live || live.phase !== "playing") return;
          live.participants = live.participants.filter((p) => p.id !== host.id);
          delete live.phrases[host.id];
          this.emit("participant:left", { participantId: host.id });
          this.handOver(host.id, "disconnected");
        }, 9000);
      }
    }
  }

  endSession(): void {
    const room = this.room;
    if (!room) return;
    room.endedAt = serverNow();
    room.phase = "ended";

    const yours = room.phrases[this.youId];
    const you = room.participants.find((p) => p.id === this.youId);
    const durationMs = room.endedAt - (this.playStartedAt ?? room.createdAt);
    const steps = gridSteps(room.transport.cycleBeats);

    // Aggregated by family, never by person: this shows the room the shape it
    // wove together without letting anyone count another participant's part.
    const weave: Record<string, number[]> = {
      rhythm: new Array(steps).fill(0),
      bass: new Array(steps).fill(0),
      bed: new Array(steps).fill(0),
      top: new Array(steps).fill(0),
    };
    for (const [participantId, phrase] of Object.entries(room.phrases)) {
      const participant = room.participants.find((q) => q.id === participantId);
      const instrument = participant?.instrumentId
        ? getInstrument(participant.instrumentId)
        : undefined;
      if (!instrument) continue;
      for (const onset of phrase.onsets) {
        const row = weave[instrument.family];
        if (row && onset.step < row.length) row[onset.step] += 1;
      }
    }

    const summary: SessionSummary = {
      roomCode: room.code,
      durationMs,
      participantCount: room.participants.length,
      you: {
        instrumentId: you?.instrumentId ?? null,
        presentMs: room.endedAt - (you?.joinedAt ?? room.createdAt),
        onsetsPlayed: yours?.onsets.length ?? 0,
        revisions: this.revisions,
      },
      room: {
        totalOnsets: Object.values(room.phrases).reduce(
          (sum, phrase) => sum + phrase.onsets.length,
          0,
        ),
        instrumentsUsed: [
          ...new Set(
            room.participants
              .map((p) => p.instrumentId)
              .filter((id): id is string => id !== null),
          ),
        ],
        cyclesCompleted: Math.max(
          0,
          Math.floor(
            (durationMs / 1000) /
              ((60 / room.transport.bpm) * room.transport.cycleBeats),
          ),
        ),
        roster: room.participants.map((q) => ({
          name: q.id === this.youId ? (you?.name ?? "You") : q.name,
          instrumentId: q.instrumentId,
        })),
        weave,
      },
    };

    this.emit("session:ended", summary);
  }
}
