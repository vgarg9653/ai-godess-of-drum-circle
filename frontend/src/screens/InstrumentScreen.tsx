import { useEffect, useState } from "react";
import { FAMILY_COLOR, FAMILY_HINT, FAMILY_LABEL, iconPath } from "@godc/shared";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { SwapSheet } from "@/components/SwapSheet";
import { useSessionStore, useYourInstrument } from "@/state/sessionStore";

/**
 * Instrument assignment.
 *
 * The room picks for you first. That is the point: the allocator is keeping the
 * frequency range balanced as people arrive, and a room where everyone chose
 * freely would be eight djembes and no melody. Changing it is one tap away, so
 * the balance is a default rather than a rule.
 */
export function InstrumentScreen() {
  const room = useSessionStore((s) => s.room);
  const youId = useSessionStore((s) => s.youId);
  const chooseInstrument = useSessionStore((s) => s.chooseInstrument);
  const previewInstrument = useSessionStore((s) => s.previewInstrument);
  const takeSeat = useSessionStore((s) => s.takeSeat);
  const instrument = useYourInstrument();

  const [swapOpen, setSwapOpen] = useState(false);
  const [pressed, setPressed] = useState(false);

  const you = room?.participants.find((p) => p.id === youId);

  // Ask for a balanced assignment as soon as we land here.
  useEffect(() => {
    if (room && you && !you.instrumentId) void chooseInstrument();
  }, [room, you, chooseInstrument]);

  if (!room || !instrument) {
    return (
      <Screen className="items-center justify-center">
        <p className="godc-breathe text-cream/60">Finding your instrument…</p>
      </Screen>
    );
  }

  const color = FAMILY_COLOR[instrument.family];

  function audition() {
    setPressed(true);
    setTimeout(() => setPressed(false), 220);
    void previewInstrument(instrument!.id);
  }

  return (
    <Screen className="items-center justify-center px-7 text-center">
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(85% 55% at 50% 32%, ${color}26 0%, rgba(0,0,0,0) 62%)`,
        }}
      />

      <p className="pl-1.5 text-[11.5px] uppercase tracking-[0.42em] text-gold">
        Your instrument tonight
      </p>

      <button
        type="button"
        onClick={audition}
        aria-label={`Hear the ${instrument.name}`}
        className="mt-5 transition-transform duration-200"
        style={{ transform: pressed ? "scale(0.94)" : "scale(1)" }}
      >
        <svg width={212} height={212} viewBox="0 0 220 220" style={{ overflow: "visible" }}>
          <circle cx="110" cy="110" r="100" fill="none" stroke={color} strokeWidth="1.6" opacity="0.85" />
          <circle
            cx="110" cy="110" r="84" fill="none" stroke="#f6ecd9" strokeWidth="1"
            strokeDasharray="2 7" opacity="0.3" className="godc-spin"
            style={{ transformOrigin: "110px 110px" }}
          />
          <circle cx="110" cy="110" r="62" fill="none" stroke={color} strokeWidth="1" opacity="0.5" />
          <g transform="translate(74 74) scale(1.5)" style={{ filter: `drop-shadow(0 0 9px ${color})` }}>
            <path
              d={iconPath(instrument.id)} fill="none" stroke={color}
              strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
            />
          </g>
          <circle cx="110" cy="10" r="3.4" fill={color} />
        </svg>
      </button>

      <div className="mt-4 flex items-baseline gap-3.5">
        <h1 className="font-display text-[40px] leading-none">{instrument.name}</h1>
        {instrument.dev && (
          <span className="font-display text-[26px] text-gold">{instrument.dev}</span>
        )}
      </div>

      <p className="mt-3.5 rounded-full border border-cream/30 px-4 py-1.5 text-[12.5px] uppercase tracking-[0.14em] text-cream/75">
        {instrument.feel}
      </p>
      <p className="mt-2 text-[12px] text-cream/45">
        you are the {FAMILY_LABEL[instrument.family]} — {FAMILY_HINT[instrument.family]}
      </p>

      <Button className="mt-8" onClick={takeSeat}>
        Take your seat
      </Button>
      <Button variant="quiet" className="mt-4" onClick={() => setSwapOpen(true)}>
        swap instrument
      </Button>

      {swapOpen && (
        <SwapSheet
          room={room}
          youId={youId}
          current={instrument}
          onPick={(id) => {
            void previewInstrument(id);
            void chooseInstrument(id);
            setSwapOpen(false);
          }}
          onClose={() => setSwapOpen(false)}
        />
      )}
    </Screen>
  );
}
