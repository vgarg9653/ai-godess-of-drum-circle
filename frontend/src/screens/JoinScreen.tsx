import { useState } from "react";
import { useParams } from "react-router-dom";
import { GROUP_SIZES, type GroupSize, type RoomMode } from "@godc/shared";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { useSessionStore } from "@/state/sessionStore";

/**
 * Name entry — for the host starting a circle, and for anyone opening the link.
 *
 * A name and nothing else. No account, no email, no password. Every extra field
 * is one more thing standing between a person and the circle.
 *
 * The host also picks the room's size here, before anyone joins, because it sets
 * the target instrument balance for the whole room. Asking later would mean
 * re-allocating instruments people had already settled into.
 */
export function JoinScreen({
  hosting = false,
  mode = "jam",
}: {
  hosting?: boolean;
  mode?: RoomMode;
}) {
  const { code } = useParams<{ code: string }>();
  const createRoom = useSessionStore((s) => s.createRoom);
  const joinRoom = useSessionStore((s) => s.joinRoom);
  const error = useSessionStore((s) => s.error);

  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("godc_name") ?? "";
    } catch {
      // Private browsing, or site data blocked. A blank field is a fine default.
      return "";
    }
  });
  const [manualCode, setManualCode] = useState(code ?? "");
  const [size, setSize] = useState<GroupSize | null>(null);

  const trimmed = name.trim();
  const ready = hosting
    ? trimmed.length > 0 && size !== null
    : trimmed.length > 0 && manualCode.trim().length > 0;

  function go() {
    if (!ready) return;
    try {
      localStorage.setItem("godc_name", trimmed);
    } catch {
      // Remembering the name is a courtesy, not a requirement.
    }
    if (hosting && size) void createRoom(trimmed, size, mode);
    else void joinRoom(manualCode.trim().toUpperCase(), trimmed);
  }

  return (
    <Screen className="justify-center px-9">
      <p className="text-[11.5px] uppercase tracking-[0.42em] text-gold">
        {mode === "song" ? "Tonight’s song" : "Tonight’s circle"}
      </p>
      <h1 className="mt-3.5 font-display text-[31px] leading-tight text-pretty">
        What should the circle call you?
      </h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go();
        }}
        placeholder="Your first name"
        autoComplete="given-name"
        autoFocus
        className="mt-10 w-full border-0 border-b-2 border-cream/30 bg-transparent px-0.5 pb-3.5 pt-2 text-3xl font-medium text-cream caret-rhythm placeholder:text-cream/25 focus:border-rhythm"
      />

      {!hosting && !code && (
        <>
          <p className="mt-9 text-[11px] uppercase tracking-[0.3em] text-cream/50">
            room code
          </p>
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="ABCD"
            autoCapitalize="characters"
            className="mt-3 w-full rounded-2xl border border-cream/15 bg-cream/[0.03] py-4 text-center font-display text-2xl tracking-[0.4em] text-cream focus:border-rhythm"
          />
        </>
      )}

      {hosting && (
        <div className="mt-9">
          <p className="text-[11px] uppercase tracking-[0.3em] text-cream/50">
            how big will tonight’s circle be?
          </p>
          <div className="mt-3.5 flex gap-2.5">
            {GROUP_SIZES.map((option) => {
              const active = size === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSize(option.id)}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl border py-3 transition ${
                    active
                      ? "border-rhythm bg-rhythm/12"
                      : "border-cream/14 hover:border-cream/30"
                  }`}
                >
                  <span className="text-[13.5px] font-semibold">{option.label}</span>
                  <span className="text-[11px] text-cream/50">{option.sub}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-cream/40 text-pretty">
            A circle needs three to breathe — one pulse, one ground, one voice.
            Instruments stay balanced as people join.
          </p>
        </div>
      )}

      {error && <p className="mt-5 text-sm text-bass">{error}</p>}

      <Button className="mt-10 self-start" disabled={!ready} onClick={go}>
        {hosting
          ? mode === "song"
            ? "Pick a song together"
            : "Open the circle"
          : "Enter the circle"}
      </Button>
      <p className="mt-5 text-[12.5px] text-cream/40">
        No account. No email. Just your name in the ring.
      </p>
    </Screen>
  );
}
