import { useEffect, useState } from "react";
import {
  BROWSE_GROUPS,
  FAMILY_COLOR,
  INSTRUMENTS,
  iconPath,
  type Browse,
} from "@godc/shared";
import { Button } from "@/components/Button";
import { InstrumentIcon } from "@/components/InstrumentIcon";
import { Screen } from "@/components/Screen";
import { useSessionStore, useYourInstrument } from "@/state/sessionStore";

/**
 * Choosing what you play.
 *
 * Everything is on this one screen: what you have been given, the groups, and
 * every instrument. There is no link to open and no filter to find — a person
 * standing in a room with a phone in one hand should be able to see the whole
 * choice at once and touch the one they like the sound of.
 *
 * Each tile leads with **what it feels like**, not what it is called. "Deep and
 * round" tells you something; "Djembe" only helps if you already knew. The name
 * is still there, underneath, for the people who did.
 *
 * The room still picks for you first — the allocator is keeping the frequency
 * range balanced as people arrive, and a room where everybody chose freely would
 * be eight djembes and no melody. Changing it is one touch, so the balance is a
 * default rather than a rule.
 */
export function InstrumentScreen() {
  const room = useSessionStore((s) => s.room);
  const youId = useSessionStore((s) => s.youId);
  const chooseInstrument = useSessionStore((s) => s.chooseInstrument);
  const previewInstrument = useSessionStore((s) => s.previewInstrument);
  const takeSeat = useSessionStore((s) => s.takeSeat);
  const reshuffle = useSessionStore((s) => s.reshuffleInstrument);
  const instrument = useYourInstrument();

  const [group, setGroup] = useState<Browse | "all">("all");
  const [pressed, setPressed] = useState<string | null>(null);
  /**
   * The full catalogue stays shut by default.
   *
   * Thirty-one names, most of which mean nothing to most people — "Ghatam",
   * "Manjira" — is a wall, not a choice. So the room gives you a sound, you can
   * ask for a different one as many times as you like, and the whole list is
   * there only if you actually want it.
   */
  const [browsing, setBrowsing] = useState(false);

  const you = room?.participants.find((p) => p.id === youId);

  useEffect(() => {
    if (room && you && !you.instrumentId) void chooseInstrument();
  }, [room, you, chooseInstrument]);

  if (!room || !instrument) {
    return (
      <Screen className="items-center justify-center">
        <p className="godc-breathe text-cream/60">Finding you something to play…</p>
      </Screen>
    );
  }

  const mineColor = FAMILY_COLOR[instrument.family];
  const shown = group === "all" ? INSTRUMENTS : INSTRUMENTS.filter((i) => i.browse === group);

  function touch(id: string) {
    setPressed(id);
    setTimeout(() => setPressed(null), 200);
    void previewInstrument(id);
    if (id !== instrument!.id) void chooseInstrument(id);
  }

  return (
    <Screen scroll className="px-5">
      {/* What you have. Tapping it plays it. */}
      <p className="pl-1 text-[11px] uppercase tracking-[0.42em] text-gold">
        Yours tonight
      </p>
      <button
        type="button"
        onClick={() => touch(instrument.id)}
        className="mt-2.5 flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition"
        style={{
          borderColor: `${mineColor}80`,
          background: `linear-gradient(100deg, ${mineColor}1f, transparent)`,
          transform: pressed === instrument.id ? "scale(0.985)" : "scale(1)",
        }}
      >
        <svg width={54} height={54} viewBox="0 0 48 48" className="flex-none">
          <path
            d={iconPath(instrument.id)}
            fill="none"
            stroke={mineColor}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 7px ${mineColor})` }}
          />
        </svg>
        <span className="min-w-0">
          <span className="block font-display text-[26px] leading-tight">
            {instrument.feel}
          </span>
          <span className="block text-[13px] text-cream/55">
            {instrument.name}
            {instrument.dev && <span className="ml-1.5 text-gold/80">{instrument.dev}</span>}
          </span>
          <span className="mt-0.5 block text-[11px] text-cream/35">tap to hear it</span>
        </span>
      </button>

      {/* Not a list. One button that hands you something else. */}
      <button
        type="button"
        onClick={() => void reshuffle()}
        className="mt-3 w-full rounded-2xl border border-cream/16 py-3.5 text-[14px] text-cream/75 transition active:bg-cream/5"
      >
        Give me a different one
      </button>

      <div className="sticky bottom-0 -mx-5 mt-4 bg-gradient-to-t from-ink via-ink/95 to-transparent px-5 pb-1 pt-4">
        <Button className="w-full" onClick={takeSeat}>
          I'm ready
        </Button>
      </div>

      {!browsing ? (
        <button
          type="button"
          onClick={() => setBrowsing(true)}
          className="mx-auto mt-5 pb-2 text-[12.5px] text-cream/35 underline underline-offset-4"
        >
          see everything
        </button>
      ) : (
        <>
      <p className="mt-6 pl-1 text-[11px] uppercase tracking-[0.3em] text-cream/45">
        Everything in the room
      </p>
      <div className="-mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5 pb-1">
        <Chip active={group === "all"} onClick={() => setGroup("all")} label="All" />
        {BROWSE_GROUPS.map((g) => (
          <Chip
            key={g.id}
            active={group === g.id}
            onClick={() => setGroup(g.id)}
            label={g.label}
            dev={g.dev}
          />
        ))}
      </div>
      {group !== "all" && (
        <p className="mt-2 pl-1 text-[11.5px] text-cream/40">
          {BROWSE_GROUPS.find((g) => g.id === group)?.hint}
        </p>
      )}

      {/* Every instrument, feeling first. */}
      <div className="mt-3.5 grid grid-cols-2 gap-2 pb-4">
        {shown.map((option) => {
          const color = FAMILY_COLOR[option.family];
          const mine = option.id === instrument.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => touch(option.id)}
              className={`flex flex-col gap-1.5 rounded-2xl border p-3 text-left transition ${
                mine ? "border-transparent" : "border-cream/12"
              }`}
              style={{
                borderColor: mine ? color : undefined,
                background: mine ? `${color}1a` : undefined,
                transform: pressed === option.id ? "scale(0.97)" : "scale(1)",
              }}
            >
              <InstrumentIcon instrumentId={option.id} color={color} size={30} />
              <span className="text-[14px] leading-tight text-cream/95">
                {option.feel}
              </span>
              <span className="text-[11px] leading-tight text-cream/45">
                {option.name}
                {option.dev && <span className="ml-1 text-gold/70">{option.dev}</span>}
              </span>
            </button>
          );
        })}
      </div>

        </>
      )}
    </Screen>
  );
}

function Chip({
  active,
  onClick,
  label,
  dev,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dev?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-none rounded-full border px-3.5 py-2 text-[12.5px] transition ${
        active
          ? "border-gold/70 bg-gold/15 text-gold"
          : "border-cream/14 text-cream/60"
      }`}
    >
      {dev && <span className="mr-1.5 font-display text-[14px]">{dev}</span>}
      {label}
    </button>
  );
}
