/**
 * Turns a SoundSpec into a playable voice.
 *
 * There is only one kind now: real recordings, triggered as one-shots. No
 * samplers, no synthesis, no pitch-shifting. Every sound in the room is a
 * recording of the actual thing, played as it was captured.
 *
 * Voices know nothing about rooms, phrases or React. They receive an absolute
 * AudioContext time and make a sound at it. Every musical decision has already
 * been made by the time we get here.
 */

import * as Tone from "tone";
import type { Stroke } from "@godc/shared";
import { KIT_BASE, filesFor, specFor, type SoundSpec } from "./soundBank";

export interface TriggerOptions {
  /** Absolute AudioContext time in seconds. */
  time: number;
  stroke: Stroke;
  /** 0..1 before stroke shaping. */
  velocity: number;
  /** Ignored — nothing is pitched. Kept so callers need not special-case. */
  midi?: number;
  /** Ignored by one-shots: a struck instrument's length is its own. */
  durationSec: number;
}

export interface Voice {
  trigger(o: TriggerOptions): void;
  /** Resolves once the files are decoded. */
  ready(): Promise<void>;
  dispose(): void;
}

/**
 * Stroke shaping.
 *
 * Only level, because these are recordings — a real drum does not get shorter
 * when you ask it to. The centre stroke is the softer one on every instrument,
 * which is the one thing that holds across a tabla, a clap and a sitar.
 */
function velocityFor(o: TriggerOptions): number {
  switch (o.stroke) {
    case "center":
      return o.velocity * 0.82;
    case "sweep":
      return Math.min(1, o.velocity * 1.08);
    case "outer":
    default:
      return o.velocity;
  }
}

/**
 * Real recordings, one shot per stroke.
 *
 * Each hit gets its own ToneBufferSource so overlapping strokes ring over one
 * another instead of cutting each other off — which matters for the long metal
 * and string sounds, where a retrigger would chop the tail.
 */
class PlayersVoice implements Voice {
  private buffers: Tone.ToneAudioBuffers;
  private out: Tone.Gain;
  private loadPromise: Promise<void>;
  private live = new Map<Tone.ToneBufferSource, Tone.Gain>();
  /** Round-robin position per stroke, so repeats alternate takes. */
  private turn: Record<string, number> = {};

  constructor(
    private spec: SoundSpec,
    destination: Tone.InputNode,
  ) {
    this.out = new Tone.Gain(Tone.dbToGain(spec.trimDb ?? 0)).connect(destination);

    let resolve!: () => void;
    this.loadPromise = new Promise((r) => (resolve = r));

    const urls: Record<string, string> = {};
    for (const file of filesFor(spec)) urls[file] = `${file}.mp3`;

    this.buffers = new Tone.ToneAudioBuffers({
      urls,
      baseUrl: KIT_BASE,
      onload: () => resolve(),
    });
  }

  private fileFor(stroke: Stroke): string {
    const files = this.spec.strokes[stroke];
    if (typeof files === "string") return files;
    const n = this.turn[stroke] ?? 0;
    this.turn[stroke] = n + 1;
    return files[n % files.length];
  }

  trigger(o: TriggerOptions): void {
    if (!this.buffers.loaded) return;
    const file = this.fileFor(o.stroke);
    const buffer = this.buffers.get(file);
    if (!buffer) return;

    // ToneBufferSource has no gain of its own, so velocity rides on a short
    // lived Gain. One node per hit is cheap next to genuine polyphony.
    const lift = Tone.dbToGain(this.spec.gains?.[file] ?? 0);
    const gain = new Tone.Gain(velocityFor(o) * lift).connect(this.out);
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

export function createVoice(instrumentId: string, destination: Tone.InputNode): Voice {
  return new PlayersVoice(specFor(instrumentId), destination);
}
