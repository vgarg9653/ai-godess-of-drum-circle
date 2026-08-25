import { iconPath } from "@godc/shared";

interface Props {
  /** Instrument id. Emblems are one-per-instrument, keyed by id. */
  instrumentId: string;
  color?: string;
  size?: number;
  strokeWidth?: number;
  glow?: boolean;
  className?: string;
}

/** The emblem for an instrument. Same path data the play canvas draws. */
export function InstrumentIcon({
  instrumentId,
  color = "currentColor",
  size = 28,
  strokeWidth = 2.8,
  glow = false,
  className = "",
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      style={glow ? { filter: `drop-shadow(0 0 8px ${color})` } : undefined}
      aria-hidden="true"
    >
      <path
        d={iconPath(instrumentId)}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
