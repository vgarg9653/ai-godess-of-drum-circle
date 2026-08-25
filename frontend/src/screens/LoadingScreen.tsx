import { getInstrument } from "@godc/shared";
import { Screen } from "@/components/Screen";
import { useSessionStore } from "@/state/sessionStore";

/**
 * The loading gate.
 *
 * The brief requires every sample downloaded before entry, so the session
 * survives a dead connection once it starts. That is a real wait — a few
 * megabytes over shared venue wifi — so it gets a screen worth looking at
 * rather than a spinner.
 *
 * Three rings fill at different rates. Nothing is claiming to be a percentage
 * of anything in particular; they are there so the wait has visible motion.
 */
export function LoadingScreen() {
  const preload = useSessionStore((s) => s.preload);
  const fraction = preload?.fraction ?? 0;
  const done = fraction >= 1;

  // Each ring lags the one outside it, so the fill reads as depth.
  const offset = (lag: number) =>
    100 - Math.max(0, Math.min(1, (fraction - lag) / (1 - lag || 1))) * 100;

  const instrument = preload?.current ? getInstrument(preload.current) : undefined;
  const caption = instrument
    ? instrument.dev
      ? `${instrument.name} / ${instrument.dev}`
      : instrument.name
    : "…";

  return (
    <Screen className="items-center justify-center px-8 text-center">
      <svg width={216} height={216} viewBox="0 0 200 200" style={{ overflow: "visible" }}>
        <circle
          cx="100" cy="100" r="88" pathLength={100} fill="none"
          stroke="#ffaa33" strokeWidth="1.8" strokeLinecap="round"
          strokeDasharray="100" strokeDashoffset={offset(0)}
          transform="rotate(-90 100 100)"
          style={{ transition: "stroke-dashoffset .4s linear" }}
        />
        <circle
          cx="100" cy="100" r="70" pathLength={100} fill="none"
          stroke="#ff3d9a" strokeWidth="1.4" strokeLinecap="round"
          strokeDasharray="100" strokeDashoffset={offset(0.12)}
          transform="rotate(-90 100 100)"
          style={{ transition: "stroke-dashoffset .4s linear" }}
        />
        <circle
          cx="100" cy="100" r="52" pathLength={100} fill="none"
          stroke="#3fe3cd" strokeWidth="1.4" strokeLinecap="round"
          strokeDasharray="100" strokeDashoffset={offset(0.26)}
          transform="rotate(-90 100 100)"
          style={{ transition: "stroke-dashoffset .4s linear" }}
        />
        <circle
          cx="100" cy="100" r="34" fill="none" stroke="#f6ecd9"
          strokeWidth="1" strokeDasharray="2 6" opacity="0.35"
        />
        <circle
          cx="100" cy="100" r="6" fill="#ffc95c" className="godc-breathe"
          style={{
            filter: "drop-shadow(0 0 9px rgba(255,201,92,.85))",
            transformOrigin: "100px 100px",
          }}
        />
      </svg>

      <div className="relative mt-8 h-[76px] w-full">
        <div
          className="absolute inset-0 flex flex-col items-center gap-2.5 transition-opacity duration-500"
          style={{ opacity: done ? 0 : 1 }}
        >
          <p className="font-display text-[21px]">{caption}</p>
          <p className="pl-1.5 text-[11px] uppercase tracking-[0.4em] text-cream/45">
            gathering the instruments
          </p>
        </div>
        <div
          className="absolute inset-0 flex flex-col items-center gap-2 transition-opacity duration-700"
          style={{ opacity: done ? 1 : 0 }}
        >
          <p className="font-display text-[27px] text-gold">You’re ready.</p>
          <p className="text-[13px] text-cream/55">The room is waiting.</p>
        </div>
      </div>

      {preload && preload.failed.length > 0 && done && (
        <p className="mt-4 max-w-[260px] text-[11px] leading-relaxed text-cream/35 text-pretty">
          {preload.failed.length} sound
          {preload.failed.length === 1 ? "" : "s"} didn’t arrive. The circle will
          play without them.
        </p>
      )}
    </Screen>
  );
}
