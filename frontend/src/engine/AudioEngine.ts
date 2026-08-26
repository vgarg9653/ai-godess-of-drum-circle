/**
 * The audio engine.
 *
 * Deliberately outside React. Sub-millisecond scheduling cannot survive a
 * render cycle, so React subscribes to this and paints; it never drives it.
 *
 * One design point worth stating loudly: this phone plays only *its own*
 * phrase. The brief's central constraint is that participants are physically
 * together, so the mix happens in the air rather than in software. Other
 * people's phrases are held here purely to drive the presence visuals.
 * Speaker mode (`setMonitorOthers`) lets one opted-in device — typically the
 * host's laptop on a real speaker — carry the whole room's mix under the
 * phones. Off by default everywhere.
 */

import * as Tone from "tone";
import {
  degreeToMidi,
  getInstrument,
  getMood,
  gridSteps,
  stepDurationSeconds,
  type Onset,
  type Phrase,
  type TransportState,
} from "@godc/shared";
import { createVoice, type Voice } from "./voices";
import type { SharedClock } from "./clock";

/** Drift beyond this is audible as a flam, so correct it outright. */
const HARD_RESYNC_SEC = 0.06;
/** Below this, leave it alone: correcting costs more than the error. */
const SOFT_RESYNC_SEC = 0.015;
/** Fraction of a soft drift to remove per check, to avoid overshoot. */
const SOFT_CORRECTION = 0.25;

const DRIFT_CHECK_MS = 2000;

export interface EngineCallbacks {
  /** Fires once per grid step, frame-synced so it lands with the sound. */
  onStep?: (step: number) => void;
  /** Fires when a participant's onset sounds, for the presence view. */
  onParticipantHit?: (participantId: string, step: number) => void;
  /** Fires as the cycle comes round. Used to decide when a take locks in. */
  /**
   * Fires as the cycle comes round, straight from the audio callback.
   *
   * Deliberately not frame-synced: this decides when a take locks into a loop,
   * and that must happen even when the tab is backgrounded and the browser has
   * throttled requestAnimationFrame to nothing.
   */
  onCycle?: (cycleIndex: number) => void;
}

interface PreviewNote {
  stroke: "outer" | "center" | "sweep";
  degree: number;
  velocity: number;
  gap: number;
}

/**
 * A short phrase to audition an instrument with.
 *
 * Every instrument used to get the same four notes, which meant auditioning the
 * tanpura, the pad and the Rhodes played you an identical tune three times and
 * they all sounded like each other. This derives a different figure per
 * instrument — deterministically, so an instrument always previews the same way
 * and people can compare two of them fairly.
 *
 * Sustaining voices get fewer, longer, more spread-out notes; struck voices get
 * a quicker, denser figure. That difference alone tells you most of what you
 * need to know about how a voice behaves.
 */
function previewFigure(instrumentId: string, sustains: boolean): PreviewNote[] {
  let h = 2166136261;
  for (let i = 0; i < instrumentId.length; i++) {
    h ^= instrumentId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };

  const count = sustains ? 3 : 5;
  const base = sustains ? 0.85 : 0.26;
  const shapes = [
    [0, 2, 4, 2, 0],
    [0, 1, 3, 1, 2],
    [0, 4, 2, 3, 1],
    [0, 3, 1, 4, 2],
  ];
  const shape = shapes[Math.floor(rand() * shapes.length) % shapes.length];
  const strokes: Array<"outer" | "center" | "sweep"> = ["outer", "center", "outer", "outer", "sweep"];

  return Array.from({ length: count }, (_, i) => ({
    stroke: strokes[i % strokes.length],
    degree: shape[i % shape.length],
    velocity: i === 0 ? 0.9 : 0.72 + rand() * 0.2,
    // Nudge the spacing so figures do not all march in lockstep.
    gap: base * (0.82 + rand() * 0.45),
  }));
}

export class AudioEngine {
  private started = false;
  private master: Tone.Gain | null = null;
  private limiter: Tone.Limiter | null = null;

  private localVoice: Voice | null = null;
  private testVoice: Voice | null = null;
  private chimeVoice: Voice | null = null;
  private localInstrumentId: string | null = null;
  private localPhrase: Phrase | null = null;

  /** All phrases including the local one, for visuals. */
  private phrases = new Map<string, Phrase>();
  /** Only populated while speaker mode is on. Keyed by participant. */
  private monitorVoices = new Map<string, { instrumentId: string; voice: Voice }>();

  private transport: TransportState | null = null;
  private repeatId: number | null = null;
  private driftTimer: ReturnType<typeof setInterval> | null = null;

  private monitorOthers = false;

  /**
   * Speaker mode: this one device also plays everybody else's parts.
   *
   * The design is that each phone sounds only its own instrument and the room
   * mixes in the air — that stands. But a host's laptop on a decent speaker
   * carrying the full mix under the phones makes a thin room thick, and it is
   * genuinely useful when phone speakers are weak. Opt-in, per device, and the
   * master limiter is downstream of all of it.
   */
  setMonitorOthers(enabled: boolean): void {
    this.monitorOthers = enabled;
    if (!enabled) {
      for (const entry of this.monitorVoices.values()) entry.voice.dispose();
      this.monitorVoices.clear();
      return;
    }
    if (!this.master) return;
    for (const [id, phrase] of this.phrases) this.ensureMonitorVoice(id, phrase);
  }

  private ensureMonitorVoice(participantId: string, phrase: Phrase): void {
    if (!this.master) return;
    const existing = this.monitorVoices.get(participantId);
    if (existing?.instrumentId === phrase.instrumentId) return;
    // New participant, or they changed instrument: rebuild their voice.
    existing?.voice.dispose();
    this.monitorVoices.set(participantId, {
      instrumentId: phrase.instrumentId,
      voice: createVoice(phrase.instrumentId, this.master),
    });
  }

  /** Where the playhead is, so a live strike knows whether its step is ahead. */
  private currentStep = 0;
  private lastStep = -1;
  private cycleIndex = 0;

  /**
   * Whether the local phrase is looping yet.
   *
   * While a take is being laid down the loop stays silent — the player is
   * hearing their own hands, not a recording of them. It starts repeating when
   * the take locks.
   */
  private localLoopEnabled = false;

  /**
   * Steps already sounded live this time round, so the loop does not repeat
   * them a fraction of a second later. See `auditionOnset`.
   */
  private suppressOnce = new Set<number>();

  constructor(
    private readonly clock: SharedClock,
    private readonly callbacks: EngineCallbacks = {},
  ) {}

  get isStarted(): boolean {
    return this.started;
  }

  /**
   * Must be called from a real user gesture — browsers refuse to start audio
   * otherwise, and on iOS a silent AudioContext is indistinguishable from a
   * broken app.
   */
  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    // Phone speakers need a hot signal. The limiter is the safety net: the
    // master can push into it and transients get shaved, not clipped.
    this.limiter = new Tone.Limiter(-1).toDestination();
    this.master = new Tone.Gain(1.0).connect(this.limiter);

    const transport = Tone.getTransport();
    this.repeatId = transport.scheduleRepeat((time) => {
      this.tick(time);
    }, "16n");

    this.driftTimer = setInterval(() => this.correctDrift(), DRIFT_CHECK_MS);
    this.started = true;

    if (this.transport) this.applyTransport(this.transport);
  }

  /**
   * Room volume, 0..1.
   *
   * Applied as a gain curve rather than linearly: loudness is perceived
   * roughly logarithmically, so a linear slider spends most of its travel in
   * the top few dB and feels broken at the bottom.
   */
  setMasterVolume(level: number): void {
    if (!this.master) return;
    const clamped = Math.max(0, Math.min(1, level));
    // The old curve (x^1.8 × 0.95) made the DEFAULT slider position quieter
    // than never touching the slider at all — sound check turned the room
    // down. Now: gentle curve, unity around 80%, up to +3.5dB of push at the
    // top, with the limiter downstream to keep the push honest.
    this.master.gain.rampTo(Math.pow(clamped, 1.3) * 1.5, 0.05);
  }

  /**
   * One real hit, right now. The sound-check slider used to fire a whole
   * multi-note preview figure per movement — dragging spawned overlapping
   * figures, which masked exactly the volume difference the slider was
   * supposed to demonstrate. One dholak stroke per move is legible.
   */
  playTestHit(velocity = 0.9): void {
    if (!this.master) return;
    if (!this.testVoice) this.testVoice = createVoice("dholak", this.master);
    this.testVoice.trigger({
      time: Tone.immediate(),
      stroke: "outer",
      velocity,
      durationSec: 0.5,
    });
  }

  /**
   * A single soft bell — the sound of "your groove is set".
   *
   * People tapped and could not tell when their loop had taken over; a state
   * change you can HEAR is clearer than any caption. One manjira ting, quiet,
   * once. It announces a state, never a score.
   */
  playLockChime(): void {
    if (!this.master) return;
    if (!this.chimeVoice) this.chimeVoice = createVoice("manjira", this.master);
    this.chimeVoice.trigger({
      time: Tone.immediate(),
      stroke: "outer",
      velocity: 0.5,
      durationSec: 1,
    });
  }

  /* ---------------- transport ---------------- */

  setTransport(state: TransportState): void {
    const previous = this.transport;
    this.transport = state;
    if (!this.started) return;

    const structural =
      !previous ||
      previous.startedAt !== state.startedAt ||
      previous.cycleBeats !== state.cycleBeats;

    if (structural) {
      this.applyTransport(state);
    } else {
      // Tempo and mood can change without restarting the loop, so the room
      // does not stutter every time the host nudges a slider.
      Tone.getTransport().bpm.rampTo(state.bpm, 0.25);
      if (previous.moodId !== state.moodId) this.rebuildLocalVoice();
    }
  }

  /** Align Tone's transport to the room's shared origin. */
  private applyTransport(state: TransportState): void {
    const transport = Tone.getTransport();
    transport.bpm.value = state.bpm;

    const startIn = 0.12;
    const elapsed = (this.clock.now() - state.startedAt) / 1000;

    if (elapsed < 0) {
      // The room has not begun yet. Start exactly when it does.
      transport.stop();
      transport.start(Tone.now() + Math.abs(elapsed) + startIn, 0);
      return;
    }

    transport.stop();
    // By audio-time (now + startIn), shared elapsed will be elapsed + startIn.
    transport.start(Tone.now() + startIn, elapsed + startIn);
  }

  private correctDrift(): void {
    if (!this.started || !this.transport) return;
    const transport = Tone.getTransport();
    if (transport.state !== "started") return;

    const expected = (this.clock.now() - this.transport.startedAt) / 1000;
    if (expected < 0) return;
    const drift = transport.seconds - expected;
    const magnitude = Math.abs(drift);

    if (magnitude > HARD_RESYNC_SEC) {
      transport.seconds = expected;
    } else if (magnitude > SOFT_RESYNC_SEC) {
      transport.seconds = transport.seconds - drift * SOFT_CORRECTION;
    }
  }

  /* ---------------- phrases ---------------- */

  setLocalInstrument(instrumentId: string | null): void {
    if (instrumentId === this.localInstrumentId) return;
    this.localInstrumentId = instrumentId;
    this.rebuildLocalVoice();
  }

  private rebuildLocalVoice(): void {
    this.localVoice?.dispose();
    this.localVoice = null;
    if (!this.master || !this.localInstrumentId) return;
    this.localVoice = createVoice(this.localInstrumentId, this.master);
  }

  setLocalPhrase(phrase: Phrase | null): void {
    this.localPhrase = phrase;
  }

  setLocalLoopEnabled(enabled: boolean): void {
    this.localLoopEnabled = enabled;
    if (!enabled) this.suppressOnce.clear();
  }

  /**
   * Sound a stroke the instant the finger lands.
   *
   * This is the difference between an instrument and a form. Waiting for the
   * playhead to come round means up to a full cycle of silence after a tap —
   * five seconds at 90bpm over eight beats — which reads as a broken app, not
   * as quantization.
   *
   * The onset still goes into the loop at its quantized step, so the *recording*
   * is perfectly in time even though the *audition* is exactly when you played
   * it. What you hear live is your hand; what the room hears next time round is
   * the grid.
   */
  auditionOnset(
    onset: Onset,
    suppressLoopHit = true,
    /**
     * Scales the audition only — the loop is untouched. Used while somebody
     * else is being brought into the circle: you can still practise and hear
     * yourself, softly, without stamping on their entrance.
     */
    gainScale = 1,
    /**
     * Whether the loop should skip its own copy of this hit.
     *
     * True while laying down a take: the hand already played it, so the loop
     * repeating it a fraction later would flam.
     *
     * False while cued into a song part. There the loop *is* the arrangement and
     * must keep sounding whatever the player does — and hearing your tap land
     * on top of your part, or slightly beside it, is how a person finds the
     * groove. That is the instrument behaving like an instrument, not a score.
     */
  ): void {
    if (!this.started || !this.localVoice || !this.transport) return;
    const instrument = this.localInstrumentId
      ? getInstrument(this.localInstrumentId)
      : undefined;
    if (!instrument) return;

    const mood = getMood(this.transport.moodId);
    const stepDur = stepDurationSeconds(this.transport.bpm);
    const steps = onset.durSteps ?? (instrument.sustains ? 4 : 1);

    // `Tone.now()` is NOT now. It returns currentTime + context.lookAhead, and
    // Tone's default lookAhead is 100ms — so scheduling a tap against it put the
    // sound a tenth of a second after the finger. That is the lag, and on an
    // instrument it is the difference between playing and operating.
    //
    // `immediate()` is the raw context clock. The scheduler still uses `now()`,
    // where lookahead is exactly what you want; a struck note must not.
    this.localVoice.trigger({
      time: Tone.immediate(),
      stroke: onset.stroke,
      velocity: onset.velocity * gainScale,
      midi: instrument.pitched
        ? degreeToMidi(mood, onset.degree ?? 0, instrument.octave ?? 0)
        : undefined,
      durationSec: steps * stepDur,
    });

    // If the quantized step is still ahead of the playhead, the loop would
    // sound it again moments from now — a flam against the hand that just
    // played it. Skip it once; from the next cycle it repeats normally.
    if (suppressLoopHit && this.localLoopEnabled && onset.step >= this.currentStep) {
      this.suppressOnce.add(onset.step);
    }
  }

  /** Keep a remote phrase for visuals, and for audio if monitoring is on. */
  setRemotePhrase(participantId: string, phrase: Phrase | null): void {
    if (phrase === null) {
      this.phrases.delete(participantId);
      this.monitorVoices.get(participantId)?.voice.dispose();
      this.monitorVoices.delete(participantId);
      return;
    }
    this.phrases.set(participantId, phrase);
    if (this.monitorOthers) this.ensureMonitorVoice(participantId, phrase);
  }

  /* ---------------- the clock tick ---------------- */

  private tick(time: number): void {
    const state = this.transport;
    if (!state) return;

    const steps = gridSteps(state.cycleBeats);
    const stepDur = stepDurationSeconds(state.bpm);

    const transport = Tone.getTransport();
    const seconds = transport.getSecondsAtTime(time);
    const step = ((Math.round(seconds / stepDur) % steps) + steps) % steps;
    this.currentStep = step;

    // The cycle came round.
    if (step < this.lastStep) {
      this.cycleIndex += 1;
      this.suppressOnce.clear();
      const index = this.cycleIndex;
      // Called straight from the audio callback rather than through Draw.
      // Locking a take is a state change, not a picture: it must happen even if
      // the tab is backgrounded and the draw loop has been throttled to a stop.
      this.callbacks.onCycle?.(index);
    }
    this.lastStep = step;

    // Local audio, unless this take is still being laid down.
    if (this.localLoopEnabled && this.localPhrase && this.localVoice) {
      if (this.suppressOnce.has(step)) {
        this.suppressOnce.delete(step);
      } else {
        this.playPhrase(this.localPhrase, this.localVoice, step, time, stepDur, state);
      }
    }

    // Speaker mode: this device carries the whole room.
    if (this.monitorOthers) {
      for (const [id, phrase] of this.phrases) {
        const entry = this.monitorVoices.get(id);
        if (entry) this.playPhrase(phrase, entry.voice, step, time, stepDur, state);
      }
    }

    // Visuals, scheduled so they land with the sound rather than ahead of it.
    Tone.getDraw().schedule(() => {
      this.callbacks.onStep?.(step);
      for (const [id, phrase] of this.phrases) {
        if (phrase.onsets.some((o) => o.step === step)) {
          this.callbacks.onParticipantHit?.(id, step);
        }
      }
      if (this.localLoopEnabled && this.localPhrase?.onsets.some((o) => o.step === step)) {
        this.callbacks.onParticipantHit?.("local", step);
      }
    }, time);
  }

  private playPhrase(
    phrase: Phrase,
    voice: Voice,
    step: number,
    time: number,
    stepDur: number,
    state: TransportState,
  ): void {
    const instrument = getInstrument(phrase.instrumentId);
    if (!instrument) return;
    const mood = getMood(state.moodId);

    for (const onset of phrase.onsets) {
      if (onset.step !== step) continue;
      // Sustained voices ring past their step; struck ones take the grid length
      // and let their own envelope decide when to stop.
      const steps = onset.durSteps ?? (instrument.sustains ? 4 : 1);
      voice.trigger({
        time,
        stroke: onset.stroke,
        velocity: onset.velocity,
        midi: instrument.pitched
          ? degreeToMidi(mood, onset.degree ?? 0, instrument.octave ?? 0)
          : undefined,
        durationSec: steps * stepDur,
      });
    }
  }

  /* ---------------- teardown ---------------- */

  dispose(): void {
    if (this.repeatId !== null) {
      Tone.getTransport().clear(this.repeatId);
      this.repeatId = null;
    }
    if (this.driftTimer !== null) {
      clearInterval(this.driftTimer);
      this.driftTimer = null;
    }
    Tone.getTransport().stop();

    this.localVoice?.dispose();
    this.localVoice = null;
    this.testVoice?.dispose();
    this.testVoice = null;
    this.chimeVoice?.dispose();
    this.chimeVoice = null;
    for (const entry of this.monitorVoices.values()) entry.voice.dispose();
    this.monitorVoices.clear();
    this.phrases.clear();

    this.master?.dispose();
    this.limiter?.dispose();
    this.master = null;
    this.limiter = null;
    this.started = false;
  }

  /**
   * Audition an instrument without joining the loop.
   *
   * Plays a short idiomatic figure rather than a single hit — one stroke tells
   * you almost nothing about a tanpura, and four tells you most of what you
   * need to know about a kanjira.
   */
  async preview(instrumentId: string, moodId: TransportState["moodId"]): Promise<void> {
    await this.start();
    if (!this.master) return;
    const instrument = getInstrument(instrumentId);
    if (!instrument) return;

    const voice = createVoice(instrumentId, this.master);
    await voice.ready();
    const mood = getMood(moodId);
    const now = Tone.immediate() + 0.02;
    const figure = previewFigure(instrumentId, instrument.sustains);

    let at = now;
    for (const note of figure) {
      voice.trigger({
        time: at,
        stroke: note.stroke,
        velocity: note.velocity,
        midi: instrument.pitched
          ? degreeToMidi(mood, note.degree, instrument.octave ?? 0)
          : undefined,
        durationSec: note.gap * (instrument.sustains ? 1.8 : 0.9),
      });
      at += note.gap;
    }

    // Let the tail ring out before tearing the voice down.
    setTimeout(() => voice.dispose(), (at - now + 4) * 1000);
  }
}
