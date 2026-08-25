import { useEffect, useRef, useState } from "react";
import {
  BPM_MAX,
  BPM_MIN,
  CYCLE_OPTIONS,
  MOODS,
  type MoodId,
  type TransportState,
} from "@godc/shared";

/** Milliseconds the close button must be held. Long enough to be deliberate. */
const HOLD_MS = 1600;

/**
 * Host controls.
 *
 * Only the room's creator sees this. Tempo, cycle and mood are room-wide, so
 * sixty phones each nudging them would be chaos rather than collaboration.
 *
 * Ending the circle is a hold, not a tap. It is the one irreversible action in
 * the app and it sits on the same screen as a surface people are drumming on.
 */
export function HostSheet({
  transport,
  onChange,
  onEnd,
}: {
  transport: TransportState;
  onChange: (p: { bpm?: number; cycleBeats?: number; moodId?: MoodId }) => void;
  onEnd: () => void;
}) {
  const [held, setHeld] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  useEffect(() => () => {
    if (timer.current !== null) clearInterval(timer.current);
  }, []);

  function holdStart() {
    startedAt.current = performance.now();
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = setInterval(() => {
      const pct = Math.min(100, ((performance.now() - startedAt.current) / HOLD_MS) * 100);
      setHeld(pct);
      if (pct >= 100) {
        if (timer.current !== null) clearInterval(timer.current);
        timer.current = null;
        setHeld(0);
        onEnd();
      }
    }, 40);
  }

  function holdEnd() {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
    setHeld(0);
  }

  return (
    <div className="godc-sheet flex w-full flex-col gap-4 rounded-[18px] border border-cream/14 bg-ink/92 p-[18px] backdrop-blur-sm">
      <Row label="pace">
        <span className="text-[11px] text-cream/40">slow</span>
        <input
          type="range" min={BPM_MIN} max={BPM_MAX}
          value={Math.round(transport.bpm)}
          onChange={(e) => onChange({ bpm: Number(e.target.value) })}
          className="!h-8 flex-1"
          aria-label="Tempo"
        />
        <span className="text-[11px] text-cream/40">quick</span>
      </Row>

      <Row label="cycle">
        <div className="flex flex-1 gap-2">
          {CYCLE_OPTIONS.map((option) => {
            const active = transport.cycleBeats === option.beats;
            return (
              <button
                key={option.beats}
                type="button"
                title={option.hint}
                onClick={() => onChange({ cycleBeats: option.beats })}
                className={`flex-1 rounded-[10px] border py-2.5 text-sm font-semibold transition ${
                  active ? "border-rhythm bg-rhythm/15" : "border-cream/14 text-cream/70"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </Row>

      <Row label="mood">
        <div className="flex flex-1 gap-2">
          {MOODS.map((mood) => {
            const active = transport.moodId === mood.id;
            return (
              <button
                key={mood.id}
                type="button"
                title={mood.description}
                onClick={() => onChange({ moodId: mood.id })}
                className={`flex-1 rounded-full border py-2.5 text-[13px] transition ${
                  active ? "border-bed bg-bed/15" : "border-cream/14 text-cream/70"
                }`}
              >
                {mood.name}
              </button>
            );
          })}
        </div>
      </Row>

      <p className="text-center text-[10.5px] uppercase tracking-[0.28em] text-cream/35">
        you opened this circle
      </p>
      <button
        type="button"
        onPointerDown={holdStart}
        onPointerUp={holdEnd}
        onPointerLeave={holdEnd}
        onPointerCancel={holdEnd}
        className="relative w-full overflow-hidden rounded-full border border-bass/50 py-3.5 text-[13.5px] tracking-[0.08em] text-bass/90"
        style={{ touchAction: "none" }}
      >
        <span
          className="absolute inset-y-0 left-0 bg-bass/25 transition-[width] duration-75"
          style={{ width: `${held}%` }}
        />
        <span className="relative">hold to close the circle</span>
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="w-[52px] flex-none text-[10.5px] uppercase tracking-[0.3em] text-cream/50">
        {label}
      </span>
      {children}
    </div>
  );
}
