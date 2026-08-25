/**
 * Instrument emblems, as raw SVG path data on a 48×48 box.
 *
 * One per instrument, keyed by instrument id — so uniqueness is structural
 * rather than a thing to remember. Two instruments cannot share an emblem by
 * accident, because there is no shared key to reach for.
 *
 * Kept as plain strings rather than components because they are drawn two ways:
 * as React <path> in the DOM screens, and as Path2D on the play canvas. One
 * source, both renderers.
 *
 * Drawing rules, so the set reads as one family:
 *  - stroke only, no fills; the renderer supplies width and colour
 *  - roughly 32–38 units tall, centred in the box
 *  - the silhouette does the work — these are read at 20px on the canvas
 */

export const ICON_PATHS: Record<string, string> = {
  /* ---- rhythm -------------------------------------------------- */

  // The pair: small dayan, larger bayan.
  tabla:
    "M9 21h13v9a6.5 4.5 0 0 1-13 0zM9 21a6.5 3.5 0 0 1 13 0M27 17h14v14a7 5 0 0 1-14 0zM27 17a7 4 0 0 1 14 0",
  // Barrel drum on its side, with rope lacing.
  dholak:
    "M12 24m-4 0a4 9 0 1 0 8 0a4 9 0 1 0-8 0M36 24m-4 0a4 9 0 1 0 8 0a4 9 0 1 0-8 0M12 15h24M12 33h24M19 16l3 16M28 16l3 16",
  // Clay pot, narrow mouth, with its clay band.
  ghatam:
    "M20 8h8M21 8c0 4-9 6-9 15a12 13 0 0 0 24 0c0-9-9-11-9-15M13 26h22",
  // Small frame drum with a single jingle pair on the rim.
  kanjira:
    "M21 27m-12 0a12 12 0 1 0 24 0a12 12 0 1 0-24 0M21 27m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M33 16a3 3 0 1 0 6 0a3 3 0 1 0-6 0M36 13V9",
  // Goblet drum: wide head, pinched waist, flared foot.
  djembe:
    "M13 9h22c0 6-4 10-7 12l3 19H18l3-19c-3-2-7-6-7-12zM17 40h14",
  // Box drum with its sound hole.
  cajon:
    "M12 8h24v32H12zM12 16h24M24 30m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
  // Tall tapered drum on legs.
  conga:
    "M16 12h16l3 20a11 6 0 0 1-22 0zM16 12a8 4 0 0 1 16 0M17 38l-3 6M31 38l3 6",
  // Wide shallow ring with a crossbar handle.
  frameDrum:
    "M24 24m-16 0a16 16 0 1 0 32 0a16 16 0 1 0-32 0M24 24m-11 0a11 11 0 1 0 22 0a11 11 0 1 0-22 0M13 24h22",
  // Egg shaker, mid-shake.
  shaker:
    "M24 26m-8 0a8 11 0 1 0 16 0a8 11 0 1 0-16 0M21 22a1.5 1.5 0 1 0 .2 0M27 28a1.5 1.5 0 1 0 .2 0M10 15l-4-4M11 24H5M10 33l-4 4M38 15l4-4M37 24h6M38 33l4 4",
  // Two sticks, struck together.
  claves: "M13 11l22 26M35 11L13 37",
  // Slotted block, with its beater.
  woodblock: "M8 18h30v13H8zM13 24.5h20M40 13l5-5",
  // Paired hand cymbals, facing, joined by a cord.
  manjira:
    "M19 12a12 12 0 0 0 0 24M29 12a12 12 0 0 1 0 24M19 24h-7M29 24h7M12 20v8M36 20v8",
  // Two conical bells on a bent rod.
  agogo:
    "M14 29a5 7 0 0 0 10 0l-2-13h-6zM30 33a4.5 6 0 0 0 9 0l-2-11h-5zM22 16c5-8 10-5 13 6",
  // Two hands meeting.
  claps:
    "M20 40l-8-9a4 4 0 0 1 0-6l5 5V13a3 3 0 0 1 6 0v9M28 40l8-9a4 4 0 0 0 0-6l-5 5V13a3 3 0 0 0-6 0v9M23 8l-3-4M25 8l3-4",
  // Mouth and breath.
  beatbox:
    "M24 32c-6 0-10-4-11-9h22c-1 5-5 9-11 9zM14 16c2-3 6-3 8 0M26 16c2-3 6-3 8 0M24 36v6M18 38l-2 4M30 38l2 4",

  /* ---- bass ---------------------------------------------------- */

  // The left-hand drum, and the heel-slide that bends its pitch upward.
  bayan:
    "M9 27h30v6a15 8 0 0 1-30 0zM9 27a15 8 0 0 1 30 0M16 17c5-7 12-7 17-1M33 16l-1-5M33 16l5-2",
  // Four heavy strings over a bridge.
  bassPulse: "M11 8v32M19 8v32M27 8v32M35 8v32M6 29h36M6 33h36",
  // Big drum and its two bachi.
  taiko:
    "M24 27m-14 0a14 10 0 1 0 28 0a14 10 0 1 0-28 0M10 27v4a14 10 0 0 0 28 0v-4M13 6l9 12M35 6l-9 12",

  /* ---- bed ----------------------------------------------------- */

  // Keyboard, lid and bellows.
  harmonium:
    "M6 22h36v13H6zM13 22v8M20 22v8M27 22v8M34 22v8M10 22v-8h28v8M10 14L5 9M38 14l5-5",
  // Long neck, round gourd, four drone strings.
  tanpura:
    "M24 32m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M24 23V7M19 7h10M20 11h8M21.5 23V12M26.5 23V12",
  // Voices, carrying across the room.
  warmPad:
    "M10 24a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M19 15a13 13 0 0 1 0 18M27 10a20 20 0 0 1 0 28M35 5a27 27 0 0 1 0 38",
  // Tine, bell and keys.
  rhodes:
    "M8 27h32v11H8zM15 27v7M22 27v7M29 27v7M36 27v7M24 23V13M24 13m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M18 7l6 4l6-4",

  /* ---- top ----------------------------------------------------- */

  // Big gourd, angled neck, curved frets, small upper gourd.
  sitar:
    "M20 34m-11 0a11 11 0 1 0 22 0a11 11 0 1 0-22 0M25 26L36 10M36 10a4 4 0 1 0 5 4M16 27c4 2 8 1 11-3M18 32c4 2 8 1 11-3",
  // Held across the body: a bamboo tube, blown from the side.
  bansuri:
    "M7 30h34a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 0 0 7M13 26.5a1.5 1.5 0 1 0 .2 0M20 26.5a1.5 1.5 0 1 0 .2 0M26 26.5a1.5 1.5 0 1 0 .2 0M32 26.5a1.5 1.5 0 1 0 .2 0M37 20l-3 3",
  // Conical reed pipe flaring to a bell.
  shehnai:
    "M20 8h8l3 21 6 11H11l6-11zM22 8V4M26 8V4M23 15a1.4 1.4 0 1 0 .2 0M23 21a1.4 1.4 0 1 0 .2 0M23 27a1.4 1.4 0 1 0 .2 0",
  // Trapezoid box, struck with two light hammers.
  santoor: "M11 19h26l6 13H5zM15 23h18M17 27h14M39 6l-3 9M44 10l-4 9",
  // Graduated tines on a board.
  kalimba:
    "M10 14h28v26H10zM16 22v-9M20 19v-6M24 17v-4M28 19v-6M32 22v-9M24 31a3.5 3.5 0 1 0 .1 0",
  // Bars above, resonator tubes below.
  marimba:
    "M8 12h32M8 19h32M8 26h32M13 30v11M21 30v13M29 30v11M37 30v9",
  // Graduated metal bars and a mallet.
  glockenspiel:
    "M9 15h24M9 22h20M9 29h16M9 36h12M38 11a3.5 3.5 0 1 0 .1 0M36 15L28 28",
  // Long zither with movable bridges.
  koto: "M4 21h40v6H4zM12 21l3-6 3 6M22 21l3-6 3 6M32 21l3-6 3 6M4 31h40",
  // In flight.
  birds:
    "M8 30c0-9 7-16 16-16 6 0 9 3 12 3l6-4-3 7 5 3-8 3c-1 8-8 13-16 13M20 22a1.6 1.6 0 1 0 .2 0M14 40l6-6",
};

/** Falls back to a plain drum so a new instrument is visible, not invisible. */
export function iconPath(instrumentId: string): string {
  return ICON_PATHS[instrumentId] ?? ICON_PATHS.tabla;
}

/** Every id that has an emblem. Used by the icon-coverage test. */
export function iconIds(): string[] {
  return Object.keys(ICON_PATHS);
}
