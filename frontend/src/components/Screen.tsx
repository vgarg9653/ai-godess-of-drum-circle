import type { ReactNode } from "react";

/**
 * Full-bleed page frame.
 *
 * Fixed rather than scrolling by default: every screen but the closing one is
 * meant to sit still on a phone held in one hand, and a page that can be
 * dragged around under a drumming thumb feels broken.
 */
export function Screen({
  children,
  className = "",
  scroll = false,
}: {
  children: ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <div
      className={`godc-ground godc-grain relative flex h-full flex-col ${
        scroll ? "overflow-y-auto" : "overflow-hidden"
      } ${className}`}
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      {children}
    </div>
  );
}
