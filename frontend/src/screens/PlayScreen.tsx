import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getInstrument, instrumentLabel, type Participant } from "@godc/shared";
import { CircleCanvas } from "@/components/CircleCanvas";
import { HostSheet } from "@/components/HostSheet";
import { InstrumentIcon } from "@/components/InstrumentIcon";
import { Notice } from "@/components/Notice";
import { GROOVE_MIN_TAPS, useIsHost, useSessionStore } from "@/state/sessionStore";

interface Label {
  participant: Participant;
  x: number;
  y: number;
}

/**
 * Playing.
 *
 * Almost no interface. The circle is the instrument, and after forty-five
 * seconds even the remaining chrome fades away — the brief's setting is a room
 * of people who came to be together, not to look at phones. Any deliberate
 * touch brings it back.
 */
export function PlayScreen() {
  const room = useSessionStore((s) => s.room);
  const youId = useSessionStore((s) => s.youId);
  const phrase = useSessionStore((s) => s.phrase);
  const trance = useSessionStore((s) => s.trance);
  const loopState = useSessionStore((s) => s.loopState);
  const strike = useSessionStore((s) => s.strike);
  const clearAll = useSessionStore((s) => s.clearAll);
  const leave = useSessionStore((s) => s.leave);
  const updateTransport = useSessionStore((s) => s.updateTransport);
  const endSession = useSessionStore((s) => s.endSession);
  const wake = useSessionStore((s) => s.wake);
  const isHost = useIsHost();

  const navigate = useNavigate();
  const [label, setLabel] = useState<Label | null>(null);
  const [hostOpen, setHostOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // A name tag is an answer to a question, not a permanent fixture.
  useEffect(() => {
    if (!label) return;
    const timer = setTimeout(() => setLabel(null), 1800);
    return () => clearTimeout(timer);
  }, [label]);

  // Opening the controls should not then have them fade out from under you.
  useEffect(() => {
    if (hostOpen) wake();
  }, [hostOpen, wake]);

  // Never render nothing. If we somehow reach the play surface without an
  // instrument in hand, say so rather than showing a black rectangle.
  if (!room || !phrase) {
    return (
      <div className="godc-ground godc-grain flex h-full items-center justify-center px-8 text-center">
        <p className="godc-breathe text-cream/60">Finding your place in the circle…</p>
      </div>
    );
  }

  const instrument = getInstrument(phrase.instrumentId);
  const chrome = trance ? 0 : 1;
  const tapsLeft = Math.max(0, GROOVE_MIN_TAPS - phrase.onsets.length);

  return (
    <div className="godc-ground godc-grain relative h-full overflow-hidden">
      <Notice />
      <CircleCanvas
        participants={room.participants}
        phrases={room.phrases}
        youId={youId}
        transport={room.transport}
        trance={trance}
        loopState={loopState}
        onStroke={strike}
        onInspect={(participant, x, y) => {
          wake();
          setLabel({ participant, x, y });
        }}
      />

      {/* Masthead. Present, quiet, and the first thing to go in trance. */}
      <div
        className="pointer-events-none absolute left-5 top-5 flex items-center gap-2.5 transition-opacity duration-[2600ms]"
        style={{
          opacity: chrome,
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        {instrument && (
          <InstrumentIcon
            instrumentId={instrument.id}
            color="#ffc95c"
            size={20}
            strokeWidth={3.2}
          />
        )}
        <span className="flex flex-col gap-0.5">
          <span className="text-[10.5px] uppercase tracking-[0.36em] text-cream/50">
            {instrument ? instrumentLabel(instrument) : "Drum Circle"}
          </span>
          {/* The one line that answers "has my groove started?" */}
          <span
            className="text-[10px] tracking-[0.18em] transition-colors"
            style={{ color: loopState === "locked" ? "var(--color-top)" : "rgba(246,236,217,0.35)" }}
          >
            {loopState === "locked"
              ? "grooving"
              : tapsLeft > 0
                ? `laying down · ${tapsLeft} more tap${tapsLeft === 1 ? "" : "s"}`
                : "laying down · locks on the bar"}
          </span>
        </span>
      </div>

      <div
        className="absolute right-5 top-5 flex items-center gap-3 transition-opacity duration-[2600ms]"
        style={{
          opacity: chrome,
          pointerEvents: trance ? "none" : "auto",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        {confirmLeave ? (
          <>
            <button
              type="button"
              onClick={() => {
                leave();
                navigate("/", { replace: true });
              }}
              className="rounded-full border border-bass/50 px-4 py-1.5 text-[11px] tracking-[0.06em] text-bass/90"
            >
              yes, leave
            </button>
            <button
              type="button"
              onClick={() => setConfirmLeave(false)}
              className="text-[11px] text-cream/45 underline underline-offset-4"
            >
              stay
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                wake();
                clearAll();
              }}
              className="text-[11px] uppercase tracking-[0.2em] text-cream/45 underline underline-offset-4"
            >
              clear mine
            </button>
            <button
              type="button"
              onClick={() => {
                wake();
                setConfirmLeave(true);
              }}
              className="text-[11px] uppercase tracking-[0.2em] text-cream/45 underline underline-offset-4"
            >
              leave
            </button>
          </>
        )}
      </div>

      {/* Who is that? */}
      {label && (
        <div
          className="godc-rise pointer-events-none absolute text-center"
          style={{ left: label.x, top: label.y, transform: "translate(-50%,-100%)" }}
        >
          {(() => {
            const inst = label.participant.instrumentId
              ? getInstrument(label.participant.instrumentId)
              : undefined;
            return (
              <>
                {inst && (
                  <InstrumentIcon
                    instrumentId={inst.id}
                    color="#ffc95c"
                    size={22}
                    className="mx-auto mb-0.5 block"
                  />
                )}
                <p className="font-display text-base drop-shadow-[0_2px_12px_rgba(0,0,0,.8)]">
                  {label.participant.name}
                </p>
                <p className="text-[11px] text-cream/70 drop-shadow-[0_2px_10px_rgba(0,0,0,.8)]">
                  {inst ? instrumentLabel(inst) : ""}
                </p>
              </>
            );
          })()}
        </div>
      )}

      {/* Host strip */}
      {isHost && (
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 transition-opacity duration-[2600ms]"
          style={{
            opacity: chrome,
            pointerEvents: trance ? "none" : "auto",
            paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
          }}
        >
          {hostOpen && (
            <HostSheet
              transport={room.transport}
              onChange={(p) => {
                wake();
                updateTransport(p);
              }}
              onEnd={() => {
                setHostOpen(false);
                endSession();
              }}
            />
          )}
          <button
            type="button"
            onClick={() => {
              wake();
              setHostOpen((open) => !open);
            }}
            className="rounded-full border border-cream/18 bg-ink/70 px-6 py-2.5 text-[12px] uppercase tracking-[0.22em] text-cream/65"
          >
            {hostOpen ? "done" : "tend the circle"}
          </button>
        </div>
      )}
    </div>
  );
}
