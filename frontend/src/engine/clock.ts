/**
 * Shared clock.
 *
 * Every phone has its own wall clock, and they disagree by tens or hundreds of
 * milliseconds — far more than a drum circle can tolerate. This estimates the
 * offset between this device and the server using Cristian's algorithm, so the
 * whole room can agree on where the beat is.
 */

export interface ClockSample {
  offset: number;
  rtt: number;
}

/** How many probes to gather before the clock is considered usable. */
const WARMUP_SAMPLES = 5;
/** Keep a rolling window so a single bad packet cannot poison the estimate. */
const WINDOW = 12;

export type PingFn = (t0: number) => Promise<{ t0: number; serverTime: number }>;

export class SharedClock {
  private samples: ClockSample[] = [];
  private offsetMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ping: PingFn) {}

  /** Server epoch ms as best this device can tell. */
  now(): number {
    return Date.now() + this.offsetMs;
  }

  get offset(): number {
    return this.offsetMs;
  }

  /** Round-trip time of the best recent sample. Useful as a quality readout. */
  get quality(): { rtt: number; samples: number } {
    const best = this.samples.reduce<number>(
      (min, s) => Math.min(min, s.rtt),
      Infinity,
    );
    return { rtt: Number.isFinite(best) ? best : 0, samples: this.samples.length };
  }

  get ready(): boolean {
    return this.samples.length >= WARMUP_SAMPLES;
  }

  /** Probe until warm, then keep probing slowly to track drift. */
  async start(intervalMs = 5000): Promise<void> {
    for (let i = 0; i < WARMUP_SAMPLES; i++) {
      await this.probe();
    }
    this.timer = setInterval(() => {
      void this.probe();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async probe(): Promise<void> {
    const t0 = Date.now();
    try {
      const res = await this.ping(t0);
      const t1 = Date.now();
      const rtt = t1 - res.t0;
      // Assume the trip was symmetric: the server's clock at t1 was
      // serverTime + rtt/2, so our error against it is the difference.
      const offset = res.serverTime + rtt / 2 - t1;
      this.samples.push({ offset, rtt });
      if (this.samples.length > WINDOW) this.samples.shift();
      this.recompute();
    } catch {
      // A dropped probe is normal on crowded wifi. Keep the previous estimate
      // rather than lurching toward a value we could not measure.
    }
  }

  /**
   * Average the lowest-latency third of the window.
   *
   * The fastest round trips are the least likely to have been delayed in one
   * direction only, which is exactly the asymmetry Cristian's assumption breaks
   * on. Averaging a few of them is steadier than trusting the single best.
   */
  private recompute(): void {
    if (this.samples.length === 0) return;
    const sorted = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    const take = Math.max(1, Math.floor(sorted.length / 3));
    const best = sorted.slice(0, take);
    this.offsetMs = best.reduce((sum, s) => sum + s.offset, 0) / best.length;
  }

  /** Test seam: force an offset without probing. */
  setOffsetForTesting(ms: number): void {
    this.offsetMs = ms;
    this.samples = [{ offset: ms, rtt: 0 }];
  }
}
