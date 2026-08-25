import { useSessionStore } from "@/state/sessionStore";

/**
 * A line the room needs to hear, briefly.
 *
 * Used for things that change underneath someone — the circle changing hands,
 * most of all. It sits at the top so it never covers the play surface, and it
 * takes no pointer events so a drumming thumb passes straight through it.
 */
export function Notice() {
  const notice = useSessionStore((s) => s.notice);
  if (!notice) return null;

  return (
    <div
      className="godc-glow-in pointer-events-none absolute left-1/2 z-30 -translate-x-1/2"
      style={{ top: "max(1.1rem, env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-2.5 rounded-full border border-top/35 bg-ink/85 px-4.5 py-2.5 backdrop-blur-sm">
        <span className="godc-breathe h-2 w-2 flex-none rounded-full bg-top shadow-[0_0_10px_var(--color-top)]" />
        <span className="whitespace-nowrap text-[12.5px] text-cream/85">{notice}</span>
      </div>
    </div>
  );
}
