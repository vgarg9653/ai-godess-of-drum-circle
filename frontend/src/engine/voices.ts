/**
 * Turns a SoundSpec into a playable voice.
 *
 * Voices know nothing about rooms, phrases or React. They receive an absolute
 * AudioContext time and make a sound at it. Every musical decision — which
 * note, which step — has already been made by the time we get here.
 */

import * as Tone from "tone";
import type { Stroke } from "@godc/shared";
import { specFor, type SoundSpec, type SynthModel } from "./soundBank";

export interface TriggerOptions {
  /** Absolute AudioContext time in seconds. Never "now". */
  time: number;
  stroke: Stroke;
  /** 0..1 before stroke shaping. */
  velocity: number;
  /** Required for pitched voices, ignored otherwise. */
  midi?: number;
  /** Sounding length in seconds. */
  durationSec: number;
}

export interface Voice {
  trigger(o: TriggerOptions): void;
  /** Resolves once any samples are decoded. Immediate for synthesised voices. */
  ready(): Promise<void>;
  dispose(): void;
}

/** Stroke shaping, applied uniformly so every instrument reacts alike. */
function shape(o: TriggerOptions): { velocity: number; duration: number } {
  switch (o.stroke) {
    case "center":
      // The muted stroke: quieter and shorter, like a hand left on the skin.
      return { velocity: o.velocity * 0.78, duration: o.durationSec * 0.55 };
    case "sweep":
      return { velocity: Math.min(1, o.velocity * 1.1), duration: o.durationSec * 1.6 };
    case "outer":
    default:
      return { velocity: o.velocity, duration: o.durationSec };
  }
}

function midiToNote(midi: number): string {
  return Tone.Frequency(midi, "midi").toNote();
}

/* ------------------------------------------------------------------ *
 * Recorded percussion
 * ------------------------------------------------------------------ */

/**
 * One recorded one-shot per stroke.
 *
 * Each hit gets its own ToneBufferSource so overlapping strokes ring over each
 * other instead of cutting one another off — which matters for the long metal
 * voices (manjira, agogo) where a retrigger would chop the tail.
 */
class PlayersVoice implements Voice {
  private buffers: Tone.ToneAudioBuffers;
  private out: Tone.Gain;
  private loadPromise: Promise<void>;
  /** Sources and their per-hit gain, so both get disposed together. */
  private live = new Map<Tone.ToneBufferSource, Tone.Gain>();

  constructor(
    spec: Extract<SoundSpec, { kind: "players" }>,
    destination: Tone.InputNode,
  ) {
    this.out = new Tone.Gain(Tone.dbToGain(spec.trimDb ?? 0)).connect(destination);
    let resolve!: () => void;
    this.loadPromise = new Promise((r) => (resolve = r));
    const urls: Record<string, string> = {};
    for (const [stroke, stem] of Object.entries(spec.strokes)) {
      urls[stroke] = `${stem}.mp3`;
    }
    this.buffers = new Tone.ToneAudioBuffers({
      urls,
      baseUrl: `/samples/${spec.dir}/`,
      onload: () => resolve(),
    });
  }

  trigger(o: TriggerOptions): void {
    if (!this.buffers.loaded) return;
    const { velocity } = shape(o);
    const buffer = this.buffers.get(o.stroke);
    if (!buffer) return;

    // ToneBufferSource has no gain of its own, so velocity rides on a short
    // lived Gain. One node per hit is cheap next to genuine polyphony.
    const gain = new Tone.Gain(velocity).connect(this.out);
    const source = new Tone.ToneBufferSource(buffer).connect(gain);
    source.onended = () => {
      this.live.delete(source);
      source.dispose();
      gain.dispose();
    };
    this.live.set(source, gain);
    source.start(o.time);
  }

  ready(): Promise<void> {
    return this.loadPromise;
  }

  dispose(): void {
    for (const [source, gain] of this.live) {
      source.dispose();
      gain.dispose();
    }
    this.live.clear();
    this.buffers.dispose();
    this.out.dispose();
  }
}

/* ------------------------------------------------------------------ *
 * Recorded pitched voices
 * ------------------------------------------------------------------ */

class SamplerVoice implements Voice {
  private sampler: Tone.Sampler;
  private loadPromise: Promise<void>;

  constructor(
    spec: Extract<SoundSpec, { kind: "sampler" }>,
    destination: Tone.InputNode,
  ) {
    let resolve!: () => void;
    this.loadPromise = new Promise((r) => (resolve = r));
    const urls: Record<string, string> = {};
    for (const note of spec.notes) urls[note] = `${note}.mp3`;

    this.sampler = new Tone.Sampler({
      urls,
      baseUrl: `/samples/${spec.dir}/`,
      release: spec.release ?? 0.2,
      volume: spec.trimDb ?? 0,
      onload: () => resolve(),
    }).connect(destination);
  }

  trigger(o: TriggerOptions): void {
    if (o.midi === undefined || !this.sampler.loaded) return;
    const { velocity, duration } = shape(o);
    this.sampler.triggerAttackRelease(
      midiToNote(o.midi),
      Math.max(0.08, duration),
      o.time,
      velocity,
    );
  }

  ready(): Promise<void> {
    return this.loadPromise;
  }

  dispose(): void {
    this.sampler.dispose();
  }
}

/* ------------------------------------------------------------------ *
 * Hand-built percussion models
 * ------------------------------------------------------------------ */

/** One layer of a modelled drum stroke. */
interface Layer {
  /** Pitched body: a membrane with a falling pitch envelope. */
  body?: { freq: number; pitchDecay: number; octaves: number; decay: number; gain: number };
  /**
   * Ringing partials. A tabla's whole character is that it is *harmonic* —
   * unlike almost every other drum — so modelling it means summing partials at
   * near-integer ratios and letting them decay at different rates.
   */
  ring?: { freq: number; partials: number[]; decay: number; gain: number };
  /** Attack transient: filtered noise. */
  noise?: { type: "white" | "pink" | "brown"; filter: BiquadFilterType; freq: number; q: number; decay: number; gain: number };
}

type StrokeLayers = Record<Stroke, Layer>;

/**
 * The models.
 *
 * These exist because no openly-licensed recording of these instruments was
 * findable. They are honest approximations, not replacements — a real tabla
 * player will hear the difference instantly. Beatbox is the exception: mouth
 * percussion is a synthesised sound by nature, and this one is not a compromise.
 */
const MODELS: Record<SynthModel, StrokeLayers> = {
  // na (open rim ring) / te (dry closed) / ge (bass sweep)
  tabla: {
    outer: {
      ring: { freq: 380, partials: [1, 2, 3, 4], decay: 0.55, gain: 0.5 },
      noise: { type: "white", filter: "bandpass", freq: 2600, q: 3, decay: 0.02, gain: 0.25 },
    },
    center: {
      body: { freq: 300, pitchDecay: 0.008, octaves: 1.2, decay: 0.09, gain: 0.5 },
      noise: { type: "white", filter: "bandpass", freq: 1800, q: 2, decay: 0.035, gain: 0.3 },
    },
    sweep: {
      body: { freq: 150, pitchDecay: 0.09, octaves: 3.2, decay: 0.42, gain: 0.7 },
      ring: { freq: 190, partials: [1, 2], decay: 0.3, gain: 0.16 },
    },
  },
  // Two-headed barrel drum: low boom one side, sharp slap the other.
  dholak: {
    outer: {
      body: { freq: 110, pitchDecay: 0.05, octaves: 2.4, decay: 0.34, gain: 0.75 },
      noise: { type: "brown", filter: "lowpass", freq: 900, q: 1, decay: 0.05, gain: 0.16 },
    },
    center: {
      body: { freq: 240, pitchDecay: 0.012, octaves: 1.1, decay: 0.1, gain: 0.45 },
      noise: { type: "white", filter: "bandpass", freq: 2200, q: 1.6, decay: 0.04, gain: 0.3 },
    },
    sweep: {
      body: { freq: 90, pitchDecay: 0.12, octaves: 3, decay: 0.5, gain: 0.8 },
    },
  },
  // Clay pot: dry, hollow, almost no sustain.
  ghatam: {
    outer: {
      body: { freq: 175, pitchDecay: 0.02, octaves: 1.6, decay: 0.16, gain: 0.6 },
      noise: { type: "pink", filter: "bandpass", freq: 1300, q: 1.2, decay: 0.05, gain: 0.28 },
    },
    center: {
      body: { freq: 260, pitchDecay: 0.01, octaves: 1, decay: 0.07, gain: 0.4 },
      noise: { type: "white", filter: "highpass", freq: 3200, q: 0.8, decay: 0.03, gain: 0.3 },
    },
    sweep: {
      body: { freq: 120, pitchDecay: 0.04, octaves: 2.2, decay: 0.3, gain: 0.7 },
      noise: { type: "pink", filter: "bandpass", freq: 800, q: 1, decay: 0.12, gain: 0.2 },
    },
  },
  // The tabla's left-hand drum. Its signature is the pitch bend from the heel.
  bayan: {
    outer: {
      body: { freq: 95, pitchDecay: 0.14, octaves: 3.4, decay: 0.55, gain: 0.85 },
    },
    center: {
      body: { freq: 110, pitchDecay: 0.02, octaves: 1.4, decay: 0.14, gain: 0.6 },
    },
    sweep: {
      // The heel slides up as the note sounds: a rising bend, not a falling one.
      body: { freq: 70, pitchDecay: 0.3, octaves: 4, decay: 0.8, gain: 0.9 },
    },
  },
  tanpura: { outer: {}, center: {}, sweep: {} }, // handled by TanpuraVoice
  // Kick / snare / hi-hat. Mouth percussion is synthetic by nature.
  beatbox: {
    outer: {
      body: { freq: 52, pitchDecay: 0.055, octaves: 5, decay: 0.28, gain: 0.9 },
    },
    center: {
      body: { freq: 190, pitchDecay: 0.01, octaves: 1, decay: 0.09, gain: 0.32 },
      noise: { type: "white", filter: "bandpass", freq: 1700, q: 0.9, decay: 0.11, gain: 0.5 },
    },
    sweep: {
      noise: { type: "white", filter: "highpass", freq: 7500, q: 1, decay: 0.045, gain: 0.4 },
    },
  },
};

class ModelledPercussion implements Voice {
  private out: Tone.Gain;
  private membrane: Tone.MembraneSynth;
  private noiseSynth: Tone.NoiseSynth;
  private noiseFilter: Tone.Filter;
  /** One reusable sine per partial index, so hits do not allocate oscillators. */
  private partials: Tone.Synth[] = [];
  private partialGain: Tone.Gain;

  constructor(
    private layers: StrokeLayers,
    trimDb: number,
    destination: Tone.InputNode,
  ) {
    this.out = new Tone.Gain(Tone.dbToGain(trimDb)).connect(destination);

    this.membrane = new Tone.MembraneSynth({
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.001, release: 0.1 },
    }).connect(this.out);

    this.noiseFilter = new Tone.Filter({ type: "bandpass", frequency: 2000, Q: 1 }).connect(this.out);
    this.noiseSynth = new Tone.NoiseSynth({
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    }).connect(this.noiseFilter);

    this.partialGain = new Tone.Gain(1).connect(this.out);
    for (let i = 0; i < 4; i++) {
      this.partials.push(
        new Tone.Synth({
          oscillator: { type: "sine" },
          envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
        }).connect(this.partialGain),
      );
    }
  }

  trigger(o: TriggerOptions): void {
    const layer = this.layers[o.stroke];
    if (!layer) return;
    const { velocity } = shape(o);

    if (layer.body) {
      const b = layer.body;
      this.membrane.pitchDecay = b.pitchDecay;
      this.membrane.octaves = b.octaves;
      this.membrane.envelope.decay = b.decay;
      this.membrane.triggerAttackRelease(
        b.freq,
        b.decay,
        o.time,
        Math.min(1, velocity * b.gain * 1.4),
      );
    }

    if (layer.ring) {
      const r = layer.ring;
      r.partials.forEach((multiple, i) => {
        const synth = this.partials[i];
        if (!synth) return;
        // Higher partials die away faster, as they do on a real drum head.
        const decay = r.decay / (1 + i * 0.7);
        synth.envelope.decay = decay;
        synth.triggerAttackRelease(
          r.freq * multiple,
          decay,
          o.time,
          Math.min(1, (velocity * r.gain) / (i + 1)),
        );
      });
    }

    if (layer.noise) {
      const n = layer.noise;
      this.noiseSynth.noise.type = n.type;
      this.noiseFilter.type = n.filter;
      this.noiseFilter.frequency.setValueAtTime(n.freq, o.time);
      this.noiseFilter.Q.setValueAtTime(n.q, o.time);
      this.noiseSynth.envelope.decay = n.decay;
      this.noiseSynth.triggerAttackRelease(
        n.decay,
        o.time,
        Math.min(1, velocity * n.gain * 1.6),
      );
    }
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): void {
    this.membrane.dispose();
    this.noiseSynth.dispose();
    this.noiseFilter.dispose();
    for (const p of this.partials) p.dispose();
    this.partialGain.dispose();
    this.out.dispose();
  }
}

/**
 * Tanpura.
 *
 * Not a drum, so it gets its own model. The instrument's character is the
 * *jawari* — a wide bridge that lets each string buzz into a shimmer of upper
 * partials rather than a clean tone. Modelled as a slow-swelling sawtooth pair,
 * detuned against each other, under a filter that opens as the note blooms.
 */
class TanpuraVoice implements Voice {
  private out: Tone.Gain;
  private filter: Tone.Filter;
  private synth: Tone.PolySynth;
  private shimmer: Tone.PolySynth;

  constructor(trimDb: number, destination: Tone.InputNode) {
    this.out = new Tone.Gain(Tone.dbToGain(trimDb)).connect(destination);
    this.filter = new Tone.Filter({ type: "lowpass", frequency: 2400, Q: 0.7 }).connect(this.out);

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.35, decay: 1.4, sustain: 0.55, release: 3.2 },
    }).connect(this.filter);
    this.synth.maxPolyphony = 6;

    // The detuned twin is what makes it shimmer rather than simply sustain.
    this.shimmer = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      detune: 9,
      envelope: { attack: 0.6, decay: 1.8, sustain: 0.4, release: 3.6 },
    }).connect(this.filter);
    this.shimmer.maxPolyphony = 6;
    this.shimmer.volume.value = -7;
  }

  trigger(o: TriggerOptions): void {
    if (o.midi === undefined) return;
    const { velocity, duration } = shape(o);
    const note = midiToNote(o.midi);
    const length = Math.max(1.2, duration);
    this.synth.triggerAttackRelease(note, length, o.time, velocity * 0.7);
    this.shimmer.triggerAttackRelease(note, length, o.time + 0.03, velocity * 0.5);
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): void {
    this.synth.dispose();
    this.shimmer.dispose();
    this.filter.dispose();
    this.out.dispose();
  }
}

/* ------------------------------------------------------------------ *
 * Factory
 * ------------------------------------------------------------------ */

export function createVoice(instrumentId: string, destination: Tone.InputNode): Voice {
  const spec = specFor(instrumentId);
  switch (spec.kind) {
    case "players":
      return new PlayersVoice(spec, destination);
    case "sampler":
      return new SamplerVoice(spec, destination);
    case "synth":
      return spec.model === "tanpura"
        ? new TanpuraVoice(spec.trimDb ?? 0, destination)
        : new ModelledPercussion(MODELS[spec.model], spec.trimDb ?? 0, destination);
  }
}
