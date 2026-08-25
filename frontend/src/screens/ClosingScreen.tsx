import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FAMILY_COLOR,
  FAMILY_LABEL,
  getInstrument,
  instrumentLabel,
  type Family,
} from "@godc/shared";
import { Button } from "@/components/Button";
import { keepMandala } from "@/lib/keepMandala";
import { Mandala } from "@/components/Mandala";
import { Screen } from "@/components/Screen";
import { useSessionStore } from "@/state/sessionStore";

const FAMILY_ORDER: Family[] = ["rhythm", "bass", "bed", "top"];

function minutes(ms: number): string {
  const total = Math.round(ms / 60000);
  if (total < 1) return "under a minute";
  return `${total} minute${total === 1 ? "" : "s"}`;
}

/**
 * The close-out.
 *
 * The brief allows showing engagement but forbids ranking or comparison. So
 * this names everyone who was there without a number beside them, shows the
 * viewer their own figures, and renders the room's shape as a weave aggregated
 * by family — never by person. There is nothing here to be better at.
 */
export function ClosingScreen() {
  const summary = useSessionStore((s) => s.summary);
  const leave = useSessionStore((s) => s.leave);
  const navigate = useNavigate();

  /**
   * Leaving has to reset the URL as well as the session.
   *
   * The host arrived here from /start, so clearing the session alone would drop
   * them back onto the "open a circle" form rather than the front door.
   */
  function goHome() {
    leave();
    navigate("/", { replace: true });
  }
  const [kept, setKept] = useState<"idle" | "saved" | "failed">("idle");

  if (!summary) return null;

  // Stamped at render rather than carried on the wire: the server's day and the
  // room's day can differ, and the room's is the one people remember.
  const dateLabel = new Date().toLocaleDateString(undefined, {
    day: "numeric", month: "long", year: "numeric",
  });

  const yourInstrument = summary.you.instrumentId
    ? getInstrument(summary.you.instrumentId)
    : null;

  const weave = summary.room.weave ?? {};
  const peak = Math.max(
    1,
    ...FAMILY_ORDER.flatMap((f) => weave[f] ?? [0]),
  );

  return (
    <Screen scroll className="items-center px-7 text-center">
      <div className="godc-glow-in mt-6">
        <Mandala size={128} animated={false} />
      </div>

      <h1 className="mt-6 font-display text-[33px]">The circle closed.</h1>
      <p className="mt-2.5 text-[13px] tracking-[0.14em] text-cream/55">
        {summary.room.roster?.length ?? summary.participantCount} people
        &nbsp;·&nbsp; {minutes(summary.durationMs)}
      </p>

      <div className="my-7 h-px w-11 bg-gradient-to-r from-transparent via-rhythm to-transparent" />

      {/* Everyone who was here. Names and instruments, no figures. */}
      <div className="flex max-w-[340px] flex-wrap justify-center gap-2">
        {(summary.room.roster ?? []).map((person, i) => {
          const inst = person.instrumentId ? getInstrument(person.instrumentId) : null;
          const color = inst ? FAMILY_COLOR[inst.family] : "#6b6072";
          return (
            <div
              key={`${person.name}-${i}`}
              className="flex items-center gap-1.5 rounded-full border border-cream/14 px-3 py-1.5"
            >
              <span
                className="h-[7px] w-[7px] flex-none rounded-full"
                style={{ background: color, boxShadow: `0 0 7px ${color}` }}
              />
              <span className="text-[12.5px] font-semibold">{person.name}</span>
              <span className="text-[11px] text-cream/50">
                {inst ? inst.name : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* The weave: when each family sounded across the cycle. */}
      <div className="mt-8 w-full max-w-[330px]">
        <p className="pl-1 text-[11px] uppercase tracking-[0.36em] text-cream/50">
          the weave of the night
        </p>
        <div className="mt-3 flex flex-col gap-1.5">
          {FAMILY_ORDER.map((family) => {
            const cells = weave[family] ?? [];
            const color = FAMILY_COLOR[family];
            return (
              <div key={family} className="flex items-center gap-2.5">
                <span
                  className="w-[58px] flex-none text-right text-[10px] uppercase tracking-[0.14em]"
                  style={{ color }}
                >
                  {FAMILY_LABEL[family]}
                </span>
                <div className="flex flex-1 gap-[3px]">
                  {cells.map((value, step) => (
                    <span
                      key={step}
                      className="h-[13px] flex-1 rounded-[2px]"
                      style={{
                        background: color,
                        opacity: value ? 0.25 + 0.65 * (value / peak) : 0.07,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2.5 text-[11px] text-cream/40 text-pretty">
          when each voice sounded across the cycle — the pattern the room wove
          together
        </p>
      </div>

      {/* Your own part. Yours alone: nobody else's numbers appear anywhere. */}
      <div className="mt-8 w-full max-w-[330px] rounded-[22px] border border-cream/12 bg-cream/[0.03] p-6">
        <p className="font-display text-2xl">
          You played the {yourInstrument ? instrumentLabel(yourInstrument) : "circle"}
        </p>
        <p className="mt-2.5 text-[13px] leading-relaxed text-cream/60 text-pretty">
          Here for {minutes(summary.you.presentMs)}, {summary.you.onsetsPlayed} stroke
          {summary.you.onsetsPlayed === 1 ? "" : "s"} in your loop, reshaped{" "}
          {summary.you.revisions} time{summary.you.revisions === 1 ? "" : "s"}.
        </p>
      </div>

      <Button
        variant="outline"
        className="mt-8 !border-gold/50 bg-gold/[0.07] text-gold"
        onClick={async () => {
          const ok = await keepMandala(summary, dateLabel);
          setKept(ok ? "saved" : "failed");
        }}
      >
        Keep tonight’s mandala
      </Button>
      <p
        className="mt-4 text-[12.5px] transition-opacity duration-500"
        style={{ opacity: kept === "idle" ? 0 : 1 }}
      >
        {kept === "saved" ? (
          <span className="text-top">
            Saved to your downloads — with the date and everyone’s names.
          </span>
        ) : (
          <span className="text-bass/90">
            Your browser blocked the download. Try again from Safari or Chrome.
          </span>
        )}
      </p>

      <Button variant="quiet" className="mb-2 mt-4" onClick={goHome}>
        Return to the beginning
      </Button>
    </Screen>
  );
}
