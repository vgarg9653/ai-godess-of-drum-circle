/**
 * The preload gate.
 *
 * The brief requires all audio to be downloaded before entry, so a session
 * survives a dead connection once it has started — which is the normal state of
 * affairs in a retreat centre with sixty phones on one access point.
 *
 * This decodes every sample in the roster, not just the player's own, so
 * swapping instruments mid-session is instant and never touches the network.
 */

import * as Tone from "tone";
import { allSampleUrls } from "./soundBank";

export interface PreloadProgress {
  loaded: number;
  total: number;
  /** 0..1 */
  fraction: number;
  /** Last file that finished, for the "gathering the instruments" caption. */
  current: string;
  failed: string[];
}

/** Human-facing name from a sample URL: "/essential-kit/tabla_a.mp3" -> "tabla". */
function instrumentFromUrl(url: string): string {
  const file = url.split("/").pop() ?? "";
  // "tabla_a.mp3" -> "tabla"
  return file.replace(/\.mp3$/, "").replace(/_[a-z]$/, "");
}

/**
 * Decode every sample, reporting progress.
 *
 * Failures are collected rather than thrown: one missing file should cost the
 * room one instrument, not the whole session. Tone caches decoded buffers by
 * URL, so the voices built later reuse these rather than fetching again.
 */
export async function preloadSamples(
  onProgress: (p: PreloadProgress) => void,
  concurrency = 6,
): Promise<PreloadProgress> {
  const urls = allSampleUrls();
  const total = urls.length;
  let loaded = 0;
  const failed: string[] = [];
  const queue = [...urls];

  const report = (current: string) =>
    onProgress({
      loaded,
      total,
      fraction: total === 0 ? 1 : loaded / total,
      current,
      failed: [...failed],
    });

  report("");

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const url = queue.shift();
      if (url === undefined) return;
      try {
        await Tone.ToneAudioBuffer.load(url);
      } catch {
        failed.push(url);
      }
      loaded += 1;
      report(instrumentFromUrl(url));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker()),
  );

  return {
    loaded,
    total,
    fraction: 1,
    current: "",
    failed,
  };
}
