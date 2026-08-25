import {
  FAMILY_COLOR,
  FAMILY_LABEL,
  swapOptions,
  type Instrument,
  type Room,
} from "@godc/shared";
import { InstrumentIcon } from "./InstrumentIcon";

/**
 * Swapping instrument.
 *
 * Ordered by what the room is still missing, so the first thing a player sees
 * is the voice that would help most. Nothing is disabled — the brief permits
 * duplicates and forbids making anyone feel wrong — but the ordering quietly
 * does the work of keeping the room balanced.
 */
export function SwapSheet({
  room,
  youId,
  current,
  onPick,
  onClose,
}: {
  room: Room;
  youId: string | null;
  current: Instrument | null;
  onPick: (instrumentId: string) => void;
  onClose: () => void;
}) {
  const taken = room.participants
    .filter((p) => p.id !== youId)
    .map((p) => p.instrumentId)
    .filter((id): id is string => id !== null);

  const options = swapOptions(taken, room.expectedSize, current?.id ?? null);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        className="flex-1 bg-void/70 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="godc-sheet max-h-[76%] overflow-y-auto rounded-t-[22px] border-t border-rhythm/30 bg-ink/95 px-6 pt-5 shadow-[0_-20px_60px_rgba(0,0,0,.6)]"
        style={{ paddingBottom: "max(1.9rem, env(safe-area-inset-bottom))" }}
      >
        <p className="mb-1.5 text-center text-[11px] uppercase tracking-[0.4em] text-cream/50">
          how do you want to sound?
        </p>
        <p className="mb-3.5 text-center text-[11.5px] text-cream/40">
          the circle offers the voices it needs first
        </p>

        <div className="flex flex-col gap-1.5">
          {options.map((instrument) => {
            const mine = instrument.id === current?.id;
            const color = FAMILY_COLOR[instrument.family];
            return (
              <button
                key={instrument.id}
                type="button"
                onClick={() => (mine ? onClose() : onPick(instrument.id))}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  mine ? "border-rhythm/70 bg-rhythm/10" : "border-cream/14 hover:border-rhythm/40"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <InstrumentIcon instrumentId={instrument.id} color={color} size={26} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13px] uppercase tracking-[0.1em] text-cream/70">
                      {instrument.feel}
                    </span>
                    <span className="text-[10.5px] text-cream/40">
                      {FAMILY_LABEL[instrument.family]}
                    </span>
                  </span>
                </span>
                <span className="flex-none font-display text-[17px]">
                  {instrument.name}
                  {instrument.dev && (
                    <span className="ml-1.5 text-[15px] text-gold">{instrument.dev}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
