/**
 * Session state: the single place the UI reads from and acts through.
 *
 * The engine, clock and network client are held here as plain module-level
 * references rather than reactive state. They are long-lived objects with their
 * own lifecycles; re-creating them on a render would cut the audio.
 */

import { create } from "zustand";
import {
  PROTOCOL_VERSION,
  getInstrument,
  type GroupSize,
  type MoodId,
  type Participant,
  type Phrase,
  type Room,
  type SessionSummary,
  type Stroke,
  type UpdateTransportPayload,
} from "@godc/shared";
import { AudioEngine } from "@/engine/AudioEngine";
import { SharedClock } from "@/engine/clock";
import {
  applyTap,
  clearStep as clearOneStep,
  emptyPhrase,
  refit,
  seedFromId,
} from "@/engine/phrase";
import { preloadSamples, type PreloadProgress } from "@/engine/preload";
import { MockRoomClient } from "@/net/mockClient";
import { SocketRoomClient } from "@/net/socketClient";
import type { RoomClient, Unsubscribe } from "@/net/RoomClient";
import { usePlayheadStore } from "./playheadStore";

/**
 * The arc of a session.
 *
 * `loading` and `soundcheck` sit between joining and choosing on purpose. The
 * brief requires every sample to be downloaded before entry, and a phone on
 * silent is indistinguishable from a broken app — both are worth a screen.
 */
export type Phase =
  | "idle"
  | "connecting"
  | "loading"
  | "soundcheck"
  | "choosing"
  | "lobby"
  | "playing"
  | "ended"
  | "error";

/** Seconds of play after which the interface fades back and lets the room be. */
const TRANCE_AFTER_MS = 45_000;

/**
 * Taps before a take can lock into a loop.
 *
 * One tap is not a groove, it is an accident. Three gives the player room to
 * find a pattern with their hands before the room starts repeating it back at
 * them — and makes a stray touch on the screen harmless.
 */
export const GROOVE_MIN_TAPS = 3;

/**
 * Where a player's loop is in its life.
 *
 * `open` — they are laying down a take. Every tap sounds the instant it lands,
 * nothing repeats yet, and the room cannot hear them.
 * `locked` — the take came round the cycle and is now looping to the room.
 */
export type LoopState = "open" | "locked";

interface SessionState {
  phase: Phase;
  room: Room | null;
  youId: string | null;
  phrase: Phrase | null;
  summary: SessionSummary | null;
  error: string | null;
  preload: PreloadProgress | null;
  /** Interface dimmed and chrome hidden, once the room has settled. */
  trance: boolean;
  /** Transient banner: the circle changed hands, someone left, and so on. */
  notice: string | null;
  /** Whether this player's take is still being laid down, or looping. */
  loopState: LoopState;
  clockRtt: number;

  createRoom: (hostName: string, expectedSize: GroupSize) => Promise<void>;
  joinRoom: (roomCode: string, name: string) => Promise<void>;
  /** Unlocks audio from a user gesture and plays a test hit. */
  soundCheck: (volume: number) => Promise<void>;
  finishSoundCheck: () => void;
  chooseInstrument: (instrumentId?: string) => Promise<void>;
  previewInstrument: (instrumentId: string) => Promise<void>;
  takeSeat: () => void;
  beginSession: () => void;
  strike: (stroke: Stroke) => void;
  /** Throw away the current take and start laying down a new one. */
  startNewTake: () => void;
  clearStep: (step: number) => void;
  clearAll: () => void;
  updateTransport: (p: UpdateTransportPayload) => void;
  endSession: () => void;
  leave: () => void;
  wake: () => void;
}

let client: RoomClient | null = null;
let clock: SharedClock | null = null;
let engine: AudioEngine | null = null;
let subscriptions: Unsubscribe[] = [];
let tranceTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
/** The "tap again to change it" hint earns one showing, not one per take. */
let grooveHintShown = false;

export function getEngine(): AudioEngine | null {
  return engine;
}

export function getClock(): SharedClock | null {
  return clock;
}

/** Point at a real server with VITE_SERVER_URL; otherwise run fully mocked. */
function makeClient(): RoomClient {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  return url ? new SocketRoomClient(url) : new MockRoomClient();
}

export const useSessionStore = create<SessionState>((set, get) => {
  function teardown(): void {
    for (const off of subscriptions) off();
    subscriptions = [];
    if (tranceTimer !== null) clearTimeout(tranceTimer);
    tranceTimer = null;
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = null;
    clock?.stop();
    engine?.dispose();
    client?.disconnect();
    clock = null;
    engine = null;
    client = null;
    grooveHintShown = false;
    usePlayheadStore.getState().reset();
  }

  /** Say something for a moment, then get out of the way. */
  function say(message: string, ms = 6000): void {
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    set({ notice: message });
    noticeTimer = setTimeout(() => set({ notice: null }), ms);
  }

  function armTrance(): void {
    if (tranceTimer !== null) clearTimeout(tranceTimer);
    tranceTimer = setTimeout(() => {
      if (get().phase === "playing") set({ trance: true });
    }, TRANCE_AFTER_MS);
  }

  function pushPhrase(next: Phrase): void {
    set({ phrase: next });
    engine?.setLocalPhrase(next);
    // A take in progress stays private. The room hears and sees a groove when
    // it locks, not while someone is still feeling for it.
    if (get().loopState === "locked") client?.updatePhrase(next);
  }

  /**
   * Lock a take at the end of the cycle it was laid down in.
   *
   * Locking on the bar line rather than on the third tap is what makes it feel
   * like a loop pedal instead of a switch: you play your pattern, and it comes
   * back round with you.
   */
  function lockTakeIfReady(): void {
    const { loopState, phrase } = get();
    if (loopState !== "open" || !phrase) return;
    if (phrase.onsets.length < GROOVE_MIN_TAPS) return;

    set({ loopState: "locked" });
    engine?.setLocalLoopEnabled(true);
    client?.updatePhrase(phrase);

    if (!grooveHintShown) {
      grooveHintShown = true;
      say("That's your groove. Tap again to lay down a new one.", 7000);
    }
  }

  /** Wipe the take and start again, silent until it locks. */
  function beginTake(instrumentId: string): void {
    const fresh = emptyPhrase(instrumentId);
    set({ phrase: fresh, loopState: "open" });
    engine?.setLocalPhrase(fresh);
    engine?.setLocalLoopEnabled(false);
    client?.clearPhrase();
  }

  function wireServerEvents(): void {
    if (!client) return;

    subscriptions.push(
      client.on("room:state", (room) => {
        set({ room });
        engine?.setTransport(room.transport);
        for (const [participantId, phrase] of Object.entries(room.phrases)) {
          if (participantId !== get().youId) {
            engine?.setRemotePhrase(participantId, phrase);
          }
        }
      }),
    );

    subscriptions.push(
      client.on("participant:joined", (participant: Participant) => {
        set((s) =>
          s.room
            ? { room: { ...s.room, participants: [...s.room.participants, participant] } }
            : s,
        );
      }),
    );

    subscriptions.push(
      client.on("participant:updated", (participant: Participant) => {
        set((s) =>
          s.room
            ? {
                room: {
                  ...s.room,
                  participants: s.room.participants.map((p) =>
                    p.id === participant.id ? participant : p,
                  ),
                },
              }
            : s,
        );
      }),
    );

    subscriptions.push(
      client.on("participant:left", ({ participantId }) => {
        engine?.setRemotePhrase(participantId, null);
        set((s) =>
          s.room
            ? {
                room: {
                  ...s.room,
                  participants: s.room.participants.filter((p) => p.id !== participantId),
                },
              }
            : s,
        );
      }),
    );

    subscriptions.push(
      client.on("transport:state", (transport) => {
        const previous = get().room?.transport;
        engine?.setTransport(transport);
        set((s) => (s.room ? { room: { ...s.room, transport } } : s));

        // A cycle-length change re-folds the local phrase so nobody's
        // contribution silently falls off the end of the bar.
        const phrase = get().phrase;
        if (previous && phrase && previous.cycleBeats !== transport.cycleBeats) {
          const count = get().room?.participants.length ?? 1;
          pushPhrase(refit(phrase, previous.cycleBeats, transport.cycleBeats, count));
        }
      }),
    );

    subscriptions.push(
      client.on("host:changed", ({ participantId, previousHostId, reason }) => {
        set((state) => {
          if (!state.room) return state;
          return {
            room: {
              ...state.room,
              participants: state.room.participants.map((p) =>
                p.id === participantId
                  ? { ...p, isHost: true }
                  : p.id === previousHostId
                    ? { ...p, isHost: false }
                    : p,
              ),
            },
          };
        });

        const room = get().room;
        const inheritor = room?.participants.find((p) => p.id === participantId);
        if (participantId === get().youId) {
          // The controls are about to appear on their screen. Better they hear
          // it from us than wonder why the room suddenly has buttons.
          set({ trance: false });
          say(
            reason === "left"
              ? "The circle is yours to tend now."
              : "The host dropped away. The circle is yours to tend now.",
            8000,
          );
        } else if (inheritor) {
          say(`${inheritor.name} is tending the circle now.`);
        }
      }),
    );

    subscriptions.push(
      client.on("session:began", (transport) => {
        engine?.setTransport(transport);
        set((s) => ({
          room: s.room ? { ...s.room, phase: "playing", transport } : s.room,
        }));

        // Only join the playing screen if this person is actually seated.
        //
        // The host can press Begin while a latecomer is still on the sound
        // check or picking an instrument. Yanking them to the play surface
        // would drop them onto a screen with no instrument in their hands —
        // so they finish getting ready, and `takeSeat` sends them straight in.
        if (get().phase !== "lobby") {
          if (get().phase === "choosing" || get().phase === "soundcheck") {
            say("The circle has begun. Take your seat when you're ready.");
          }
          return;
        }

        set({ phase: "playing", trance: false });
        armTrance();
      }),
    );

    subscriptions.push(
      client.on("phrase:changed", ({ participantId, phrase }) => {
        if (participantId === get().youId) return;
        engine?.setRemotePhrase(participantId, phrase);
        set((s) =>
          s.room
            ? { room: { ...s.room, phrases: { ...s.room.phrases, [participantId]: phrase } } }
            : s,
        );
      }),
    );

    subscriptions.push(
      client.on("phrase:cleared", ({ participantId }) => {
        engine?.setRemotePhrase(participantId, null);
        set((s) => {
          if (!s.room) return s;
          const phrases = { ...s.room.phrases };
          delete phrases[participantId];
          return { room: { ...s.room, phrases } };
        });
      }),
    );

    subscriptions.push(
      client.on("session:ended", (summary) => {
        set({ summary, phase: "ended", trance: false });
        engine?.setLocalPhrase(null);
      }),
    );

    subscriptions.push(client.on("error", (e) => set({ error: e.message })));
  }

  async function enterRoom(
    run: (
      c: RoomClient,
    ) => Promise<
      | { ok: true; data: { room: Room; youId: string } }
      | { ok: false; error: { message: string } }
    >,
  ): Promise<void> {
    set({ phase: "connecting", error: null, preload: null });
    teardown();

    try {
      client = makeClient();
      await client.connect();

      const result = await run(client);
      if (!result.ok) {
        set({ phase: "error", error: result.error.message });
        return;
      }
      const { room, youId } = result.data;

      clock = new SharedClock((t0) => client!.ping(t0));
      await clock.start();

      engine = new AudioEngine(clock, {
        onStep: (step) => usePlayheadStore.getState().setStep(step),
        onParticipantHit: (participantId) =>
          usePlayheadStore.getState().pulse(participantId),
        onCycle: () => lockTakeIfReady(),
      });

      wireServerEvents();
      for (const [participantId, phrase] of Object.entries(room.phrases)) {
        if (participantId !== youId) engine.setRemotePhrase(participantId, phrase);
      }

      set({ room, youId, phase: "loading", clockRtt: clock.quality.rtt });

      // Decoding needs an AudioContext but not a running one, so the whole
      // roster can be fetched before the user has touched anything.
      const done = await preloadSamples((p) => set({ preload: p }));
      set({ preload: done });
      if (get().phase === "loading") set({ phase: "soundcheck" });
    } catch (err) {
      set({
        phase: "error",
        error: err instanceof Error ? err.message : "Could not reach the circle.",
      });
    }
  }

  return {
    phase: "idle",
    room: null,
    youId: null,
    phrase: null,
    summary: null,
    error: null,
    preload: null,
    trance: false,
    notice: null,
    loopState: "open",
    clockRtt: 0,

    createRoom: (hostName, expectedSize) =>
      enterRoom((c) =>
        c.createRoom({ hostName, expectedSize, protocolVersion: PROTOCOL_VERSION }),
      ),

    joinRoom: (roomCode, name) =>
      enterRoom((c) =>
        c.joinRoom({ roomCode, name, protocolVersion: PROTOCOL_VERSION }),
      ),

    soundCheck: async (volume) => {
      // Browsers only unlock audio from a user gesture, and iOS gives no second
      // chance — so this runs inside the slider drag that called it.
      await engine?.start();
      engine?.setMasterVolume(volume / 100);
      await engine?.preview("frameDrum", get().room?.transport.moodId ?? "monsoon");
    },

    finishSoundCheck: () => set({ phase: "choosing" }),

    chooseInstrument: async (instrumentId) => {
      if (!client) return;
      const result = await client.selectInstrument({ instrumentId });
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      const chosen = result.data.instrumentId;
      const phrase = emptyPhrase(chosen);

      engine?.setLocalInstrument(chosen);
      engine?.setLocalPhrase(phrase);
      engine?.setLocalLoopEnabled(false);

      set((s) => ({
        phrase,
        loopState: "open" as LoopState,
        room: s.room
          ? {
              ...s.room,
              participants: s.room.participants.map((p) =>
                p.id === s.youId ? { ...p, instrumentId: chosen } : p,
              ),
            }
          : s.room,
      }));
    },

    previewInstrument: async (instrumentId) => {
      const moodId: MoodId = get().room?.transport.moodId ?? "monsoon";
      await engine?.preview(instrumentId, moodId);
    },

    takeSeat: () => {
      // If the room started while this person was still choosing, they go
      // straight in rather than to a lobby that has already emptied out.
      if (get().room?.phase === "playing") {
        set({ phase: "playing", trance: false });
        armTrance();
        return;
      }
      set({ phase: "lobby" });
    },

    beginSession: () => client?.beginSession(),

    strike: (stroke) => {
      const { phrase, room, youId, loopState } = get();
      if (!phrase || !room || !clock || !youId) return;

      // Tapping on a groove that is already going means "I want a different
      // one". The old take goes, and this tap is the first of the new one.
      const base =
        loopState === "locked"
          ? (beginTake(phrase.instrumentId), get().phrase!)
          : phrase;

      const instrument = getInstrument(base.instrumentId);
      const next = applyTap(
        base,
        {
          atSharedMs: clock.now(),
          stroke,
          velocity: stroke === "sweep" ? 0.9 : 0.85,
          // A sweep on a sustaining voice is a long bloom; on a drum it is a
          // roll, which the sample already carries, so it stays short.
          ...(instrument?.sustains ? { durSteps: stroke === "sweep" ? 8 : 4 } : {}),
        },
        room.transport,
        room.participants.length,
        seedFromId(youId),
      );

      pushPhrase(next);
      // Sound it now, in the hand, rather than whenever the playhead arrives.
      const placed = next.onsets[next.onsets.length - 1];
      if (placed) engine?.auditionOnset(placed);
      get().wake();
    },

    startNewTake: () => {
      const phrase = get().phrase;
      if (phrase) beginTake(phrase.instrumentId);
    },

    clearStep: (step) => {
      const phrase = get().phrase;
      if (!phrase) return;
      const next = clearOneStep(phrase, step);
      if (next !== phrase) pushPhrase(next);
    },

    clearAll: () => {
      const phrase = get().phrase;
      if (!phrase) return;
      beginTake(phrase.instrumentId);
    },

    updateTransport: (p) => client?.updateTransport(p),

    endSession: () => client?.endSession(),

    /** Any deliberate touch brings the interface back and restarts the timer. */
    wake: () => {
      if (get().trance) set({ trance: false });
      if (get().phase === "playing") armTrance();
    },

    leave: () => {
      teardown();
      set({
        phase: "idle",
        room: null,
        youId: null,
        phrase: null,
        summary: null,
        error: null,
        preload: null,
        trance: false,
        notice: null,
        loopState: "open",
      });
    },
  };
});

/** The instrument the local player is holding. */
export function useYourInstrument() {
  return useSessionStore((s) => {
    const id = s.room?.participants.find((p) => p.id === s.youId)?.instrumentId;
    return id ? (getInstrument(id) ?? null) : null;
  });
}

export function useIsHost(): boolean {
  return useSessionStore(
    (s) => s.room?.participants.find((p) => p.id === s.youId)?.isHost ?? false,
  );
}
