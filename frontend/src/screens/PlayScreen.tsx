import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getInstrument, instrumentLabel, type Participant } from "@godc/shared";
import { PlaySurface } from "@/components/PlaySurface";
import { HostSheet } from "@/components/HostSheet";
import { InstrumentIcon } from "@/components/InstrumentIcon";
import { Notice } from "@/components/Notice";
import { layerStatus } from "@/engine/layering";
import { GROOVE_MIN_TAPS, getClock, useIsHost, useSessionStore } from "@/state/sessionStore";

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
  const cues = useSessionStore((s) => s.cues);
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
  // The one-time how-to. Real rooms showed people tapping without knowing
  // what would happen; thirty words up front fixes most of it. Per device.
  const [showHowTo, setShowHowTo] = useState(() => {
    try {
      return localStorage.getItem("godc_howto_seen") !== "1";
    } catch {
      return true;
    }
  });
  function dismissHowTo() {
    setShowHowTo(false);
    try {
      localStorage.setItem("godc_howto_seen", "1");
    } catch {
      // Private mode: they'll see it again next time. Harmless.
    }
  }

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

  /** Where we are through the cycle, 0..1, read fresh every frame. */
  function cyclePosition(): number {
    const clock = getClock();
    if (!clock || !room) return 0;
    const seconds = (60 / room.transport.bpm) * room.transport.cycleBeats;
    const elapsed = (clock.now() - room.transport.startedAt) / 1000;
    if (elapsed < 0 || seconds <= 0) return 0;
    return ((elapsed % seconds) + seconds) % seconds / seconds;
  }

  /**
   * Which sound a tap makes.
   *
   * While being taught a part, every tap uses the stroke the arrangement asks
   * for at that moment — so a person who has never held a drum cannot pick the
   * wrong one. Choosing between two sounds only starts to matter once the part
   * is theirs.
   */
  function strokeFor(inCentre: boolean): "outer" | "center" {
    if (loopState === "cued") {
      const active = cues.find((c) => !c.released);
      const onset = active && phrase
        ? phrase.onsets.find((o) => o.step === active.step)
        : undefined;
      if (onset && onset.stroke !== "sweep") return onset.stroke;
      return "outer";
    }
    return inCentre ? "outer" : "center";
  }

  const cyclesSinceBegin = useSessionStore((s) => s.cyclesSinceBegin);
  const mode = useSessionStore((s) => s.mode);
  const layer =
    mode === "song" || !youId
      ? ({ phase: "open" } as const)
      : layerStatus(room.participants, youId, cyclesSinceBegin);

  // Plain language only. Nobody here knows what a cycle or a downbeat is.
  const instruction =
    loopState === "cued"
      ? {
          title: "Tap when it lights up",
          detail: "The ring closes in on your circle. Hit it as it lands — that's all.",
        }
      : loopState === "locked"
        ? {
            title: "Your groove is playing",
            detail: "It repeats on its own now. Want a new one? Just start tapping.",
          }
        : layer.phase === "waiting"
          ? {
              title: `${layer.stageLabel} starts us off`,
              detail:
                "Practise softly — you can hear yourself, the room can't yet. Your moment is coming.",
            }
          : layer.phase === "yourTurn"
            ? {
                title: "Your turn — join in",
                detail: "Tap your rhythm on the big circle. Three taps and you're in.",
              }
            : tapsLeft > 0
              ? {
                  title: "Tap the big circle",
                  detail: "Any rhythm you like — three taps and it becomes your groove.",
                }
              : {
                  title: "Got it — starting your groove",
                  detail: "It joins the room at the top of the next round.",
                };

  return (
    <div className="godc-ground godc-grain relative h-full overflow-hidden">
      <Notice />
      <PlaySurface
        participants={room.participants}
        youId={youId}
        transport={room.transport}
        trance={trance}
        loopState={loopState}
        cues={cues}
        cyclePosition={cyclePosition}
        onStroke={strike}
        strokeFor={strokeFor}
        onInspect={(participant, x, y) => {
          wake();
          setLabel({ participant, x, y });
        }}
      />

      {/* The instruction. The biggest words on screen, because "what do I do"
          was the question people actually asked. Never jargon. */}
      <div
        className="pointer-events-none absolute inset-x-0 text-center transition-opacity duration-500"
        style={{ top: "67%", opacity: trance ? 0 : 1 }}
      >
        <p
          className="font-display text-[26px] leading-tight transition-colors duration-500"
          style={{
            color:
              loopState === "locked" ? "var(--color-top)" : "rgba(246,236,217,0.92)",
          }}
        >
          {instruction.title}
        </p>
        <p className="mx-auto mt-1.5 max-w-[300px] px-6 text-[13.5px] leading-snug text-cream/50 text-pretty">
          {instruction.detail}
        </p>

        {/* While laying down: the three taps, as three lamps filling. The same
            fact as "2 more taps", but readable mid-motion without reading. */}
        {loopState === "open" && (
          <div className="mt-3 flex items-center justify-center gap-2.5">
            {Array.from({ length: GROOVE_MIN_TAPS }, (_, i) => {
              const lit = i < phrase.onsets.length;
              return (
                <span
                  key={i}
                  className="h-2.5 w-2.5 rounded-full transition-all duration-300"
                  style={{
                    background: lit ? "var(--color-gold)" : "rgba(246,236,217,0.15)",
                    boxShadow: lit ? "0 0 10px var(--color-gold)" : "none",
                    transform: lit ? "scale(1.15)" : "scale(1)",
                  }}
                />
              );
            })}
          </div>
        )}

        {/* At the moment it locks, say so where the eyes already are. */}
        {loopState === "locked" && (
          <div className="mx-auto mt-3 h-1 w-24 overflow-hidden rounded-full bg-cream/10">
            <div className="godc-breathe h-full w-full rounded-full bg-top/70" />
          </div>
        )}
      </div>

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
            style={{
              color:
                loopState === "locked"
                  ? "var(--color-top)"
                  : loopState === "cued"
                    ? "var(--color-gold)"
                    : "rgba(246,236,217,0.35)",
            }}
          >
            {/* Never a count of what has been found. That would be a score. */}
            {loopState === "cued"
              ? "your part · tap along"
              : loopState === "locked"
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
            {loopState !== "cued" && (
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
            )}
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

      {/* First time on the surface: how this works, in thirty words. */}
      {showHowTo && mode !== "song" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-void/75 px-7 backdrop-blur-[2px]">
          <div className="godc-glow-in w-full max-w-[330px] rounded-[22px] border border-gold/30 bg-ink p-6">
            <p className="text-[11px] uppercase tracking-[0.35em] text-gold">
              how it works
            </p>
            <div className="mt-4 flex flex-col gap-3.5">
              {[
                ["Tap the big circle", "any rhythm, there's no wrong one"],
                ["Three taps and it loops", "you'll hear a small bell — that's your groove playing by itself"],
                ["Tap again anytime", "to swap it for a new one"],
              ].map(([head, sub], i) => (
                <p key={head} className="flex items-baseline gap-3">
                  <span className="flex-none font-display text-[17px] text-gold">{i + 1}</span>
                  <span>
                    <span className="block text-[15px] leading-snug text-cream/95">{head}</span>
                    <span className="block text-[12px] leading-snug text-cream/50">{sub}</span>
                  </span>
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={dismissHowTo}
              className="mt-5 w-full rounded-full bg-gradient-to-br from-bass to-rhythm py-3 text-[15px] font-bold text-[#2a1106]"
            >
              Let's play
            </button>
          </div>
        </div>
      )}

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
              room={room}
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
