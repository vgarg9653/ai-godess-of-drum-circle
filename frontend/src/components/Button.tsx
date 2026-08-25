import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "quiet";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-bass to-rhythm text-[#2a1106] font-bold shadow-[0_0_34px_rgba(255,140,50,0.32)]",
  outline:
    "border border-cream/25 text-cream/85 hover:border-rhythm/60 active:bg-cream/5",
  quiet:
    "bg-transparent text-cream/55 underline underline-offset-4 hover:text-cream/85",
};

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  const shape =
    variant === "quiet"
      ? "text-[13.5px]"
      : // 56px floor and a full pill: used one-handed, standing, in a dim room.
        "min-h-14 rounded-full px-11 text-base tracking-[0.01em]";
  return (
    <button
      className={`transition active:brightness-110 disabled:pointer-events-none disabled:opacity-35 ${shape} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
