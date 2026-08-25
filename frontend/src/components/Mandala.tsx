import { ICON_PATHS } from "@godc/shared";

/**
 * The mark: a cycle of beats with one bright pulse travelling it.
 *
 * The tick lengths are uneven on purpose — long, short, longer — so it reads as
 * a rhythm rather than a clock face. Instrument emblems fade through the middle
 * so the mark says "many voices, one cycle" without a word of explanation.
 */

/** Tick lengths in viewBox units, measured outward from r=41. */
const TICKS = [
  { deg: 30, len: 9 }, { deg: 60, len: 6 }, { deg: 90, len: 13 },
  { deg: 120, len: 6 }, { deg: 150, len: 9 }, { deg: 180, len: 13 },
  { deg: 210, len: 6 }, { deg: 240, len: 9 }, { deg: 270, len: 6 },
  { deg: 300, len: 13 }, { deg: 330, len: 6 },
];

/** A few emblems, cycled through the middle of the mark. */
const CYCLING = ["tabla", "bansuri", "sitar", "harmonium", "kanjira", "djembe"] as const;

export function Mandala({
  size = 156,
  animated = true,
}: {
  size?: number;
  animated?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }} aria-hidden="true">
      <circle
        cx="50" cy="50" r="21" fill="none" stroke="#f6ecd9"
        strokeWidth="1" strokeDasharray="1.5 4.6" opacity="0.5"
      />

      {animated &&
        CYCLING.map((key, i) => (
          <g
            key={key}
            transform="translate(37 37) scale(0.54)"
            className="godc-cycle"
            style={{ animationDelay: `${i * 1.2}s` }}
          >
            <path
              d={ICON_PATHS[key]}
              fill="none" stroke="#ffc95c" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </g>
        ))}

      {TICKS.map((tick, i) => (
        <line
          key={tick.deg}
          x1="50" y1="9" x2="50" y2={9 + tick.len}
          stroke="#f6ecd9" strokeWidth="2.6" strokeLinecap="round"
          transform={`rotate(${tick.deg} 50 50)`}
          className={animated ? "godc-seq" : undefined}
          style={animated ? { animationDelay: `${0.4 + i * 0.4}s` } : undefined}
        />
      ))}

      <circle
        cx="50" cy="13" r="4.6" fill="#ffaa33"
        className={animated ? "godc-beat" : undefined}
        style={{
          filter: "drop-shadow(0 0 7px rgba(255,170,51,.9))",
          transformOrigin: "50px 13px",
        }}
      />
    </svg>
  );
}
