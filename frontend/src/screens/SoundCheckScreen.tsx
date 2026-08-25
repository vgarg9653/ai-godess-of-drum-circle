import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { useSessionStore } from "@/state/sessionStore";

/**
 * Sound check.
 *
 * The single most valuable screen in the app, and the least obvious. A phone on
 * silent produces no sound and no error, so without this a participant sits
 * through a whole session believing the app is broken — and on iOS the fix is a
 * physical switch no software can reach.
 *
 * Dragging the slider plays a test hit on every move, which does two jobs at
 * once: it sets the level, and it is the user gesture that unlocks audio.
 */
export function SoundCheckScreen() {
  const soundCheck = useSessionStore((s) => s.soundCheck);
  const finish = useSessionStore((s) => s.finishSoundCheck);

  const [volume, setVolume] = useState(65);
  const [touched, setTouched] = useState(false);
  const [flash, setFlash] = useState(0);
  const throttle = useRef(0);

  function onVolume(next: number) {
    setVolume(next);
    setTouched(true);
    // One test hit per 140ms: enough to feel responsive, not a machine gun.
    const now = performance.now();
    if (now - throttle.current < 140) return;
    throttle.current = now;
    setFlash((n) => n + 1);
    void soundCheck(next);
  }

  return (
    <Screen className="justify-center px-8">
      <p className="text-[11.5px] uppercase tracking-[0.42em] text-gold">
        Before you sit down
      </p>
      <h1 className="mt-3 font-display text-3xl leading-tight">
        Can you hear the room?
      </h1>

      <div className="mt-9 flex items-center gap-4">
        <div className="flex-1">
          <input
            type="range" min={0} max={100} value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label="Room volume"
          />
          <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-cream/45">
            drag — every move plays a test hit
          </p>
        </div>
        <div
          key={flash}
          className="h-11 w-11 flex-none rounded-full"
          style={{
            background:
              "radial-gradient(circle, #ffaa33 0%, rgba(255,170,51,.25) 60%, transparent 75%)",
            animation: flash > 0 ? "godcBeat 420ms ease-out" : undefined,
          }}
        />
      </div>

      <div className="mt-9 flex items-center gap-4 rounded-2xl border border-rhythm/30 bg-rhythm/5 p-5">
        <svg width={54} height={80} viewBox="0 0 64 92" className="flex-none">
          <rect x="26" y="6" width="34" height="80" rx="8" fill="none" stroke="rgba(246,236,217,.55)" strokeWidth="2" />
          <rect x="15" y="22" width="8" height="15" rx="3" fill="#ffaa33" style={{ filter: "drop-shadow(0 0 5px rgba(255,170,51,.8))" }} />
          <path d="M11 52 C 5 45 5 36 10 30" fill="none" stroke="#3fe3cd" strokeWidth="2" strokeLinecap="round" />
          <path d="M10 30 l -4.5 1.5 M10 30 l 1 4.5" fill="none" stroke="#3fe3cd" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-[14.5px] leading-relaxed text-cream/85 text-pretty">
          On an iPhone? <strong className="text-gold">Flick your ringer switch on</strong>{" "}
          — otherwise your phone stays silent.
        </p>
      </div>

      <Button
        className="mt-10 self-start transition-opacity"
        style={{ opacity: touched ? 1 : 0.45 }}
        onClick={finish}
      >
        I can hear it
      </Button>
    </Screen>
  );
}
