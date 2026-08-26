import { useState } from "react";
import type { Room } from "@godc/shared";

/**
 * The room, as a thing you can hand to somebody.
 *
 * A circle only works if people can get in, and until now the URL lived
 * nowhere on screen. One tap shares it (native sheet where the phone has one,
 * clipboard where it does not), and the code stays visible for the person
 * across the room who would rather type four letters than scan anything.
 */
export function InviteLink({ room }: { room: Room }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/r/${room.code}`;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Join the circle",
          text: "Come play — open this and you're in:",
          url,
        });
        return;
      }
    } catch {
      // Dismissed the sheet; fall through to nothing.
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked too — the visible URL below is the fallback.
    }
  }

  return (
    <div className="w-full rounded-2xl border border-gold/30 bg-gold/[0.05] px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] uppercase tracking-[0.3em] text-cream/45">
            invite people
          </p>
          <p className="truncate font-display text-[17px] text-cream/90">{url}</p>
        </div>
        <button
          type="button"
          onClick={() => void share()}
          className="flex-none rounded-full border border-gold/60 bg-gold/15 px-4 py-2 text-[13px] font-semibold text-gold"
        >
          {copied ? "Copied" : "Share"}
        </button>
      </div>
      <p className="mt-1.5 text-[11.5px] text-cream/40">
        or they type the code <span className="tracking-[0.25em] text-gold">{room.code}</span> after
        “join with a link”
      </p>
    </div>
  );
}
