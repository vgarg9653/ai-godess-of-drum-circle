/**
 * Instrument emblems, as raw SVG path data on a 48×48 box.
 *
 * One per instrument, keyed by instrument id — so uniqueness is structural
 * rather than a thing to remember. Two instruments cannot share an emblem by
 * accident, because there is no shared key to reach for.
 *
 * Kept as plain strings rather than components because they are drawn two ways:
 * as React <path> in the DOM screens, and as Path2D on the play canvas.
 *
 * Drawing rules, so the set reads as one family:
 *  - stroke only, no fills; the renderer supplies width and colour
 *  - roughly 32–38 units tall, centred in the box
 *  - the silhouette does the work — these are read at 20px on the canvas
 */

export const ICON_PATHS: Record<string, string> = {
  /* ---- Beat -------------------------------------------------- */

  // The pair: small dayan, larger bayan.
  tabla:
    "M9 21h13v9a6.5 4.5 0 0 1-13 0zM9 21a6.5 3.5 0 0 1 13 0M27 17h14v14a7 5 0 0 1-14 0zM27 17a7 4 0 0 1 14 0",
  // Barrel drum on its side, with rope lacing.
  dholak:
    "M12 24m-4 0a4 9 0 1 0 8 0a4 9 0 1 0-8 0M36 24m-4 0a4 9 0 1 0 8 0a4 9 0 1 0-8 0M12 15h24M12 33h24M19 16l3 16M28 16l3 16",
  // Two hands meeting.
  claps:
    "M20 40l-8-9a4 4 0 0 1 0-6l5 5V13a3 3 0 0 1 6 0v9M28 40l8-9a4 4 0 0 0 0-6l-5 5V13a3 3 0 0 0-6 0v9M23 8l-3-4M25 8l3-4",
  // Egg shaker, mid-shake.
  shaker:
    "M24 26m-8 0a8 11 0 1 0 16 0a8 11 0 1 0-16 0M21 22a1.5 1.5 0 1 0 .2 0M27 28a1.5 1.5 0 1 0 .2 0M10 15l-4-4M11 24H5M10 33l-4 4M38 15l4-4M37 24h6M38 33l4 4",
  // Paired hand cymbals, facing, joined by a cord.
  manjira:
    "M19 12a12 12 0 0 0 0 24M29 12a12 12 0 0 1 0 24M19 24h-7M29 24h7M12 20v8M36 20v8",
  // Wooden clappers, jingles set into each plate.
  kartal:
    "M10 11h8v26h-8zM30 11h8v26h-8zM14 19a1.8 1.8 0 1 0 .2 0M14 29a1.8 1.8 0 1 0 .2 0M34 19a1.8 1.8 0 1 0 .2 0M34 29a1.8 1.8 0 1 0 .2 0M21 24h6",
  // A foot, and the ground it lands on.
  stomp:
    "M24 6c7 0 11 6 11 13 0 6-3 9-3 14 0 3 1 4 1 6H15c0-2 1-3 1-6 0-5-3-8-3-14C13 12 17 6 24 6zM8 43h32M7 36l-4 4M41 36l4 4",

  /* ---- Deep -------------------------------------------------- */

  // The big barrel drum, worn on a strap.
  dhol:
    "M12 27m-5 0a5 12 0 1 0 10 0a5 12 0 1 0-10 0M36 27m-5 0a5 12 0 1 0 10 0a5 12 0 1 0-10 0M12 15h24M12 39h24M14 14C18 5 30 5 34 14",
  // Four heavy strings over a bridge.
  bass: "M11 8v32M19 8v32M27 8v32M35 8v32M6 29h36M6 33h36",

  /* ---- Background -------------------------------------------- */

  // Body, soundhole, neck.
  guitar:
    "M17 33m-10 0a10 11 0 1 0 20 0a10 11 0 1 0-20 0M17 33m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M25 26L37 11M34 7l6 5M23 39h-6",

  /* ---- Melody ------------------------------------------------ */

  // Big gourd, angled neck, curved frets, small upper gourd.
  sitar:
    "M20 34m-11 0a11 11 0 1 0 22 0a11 11 0 1 0-22 0M25 26L36 10M36 10a4 4 0 1 0 5 4M16 27c4 2 8 1 11-3M18 32c4 2 8 1 11-3",
};

/** Falls back to a plain drum so a new instrument is visible, not invisible. */
export function iconPath(instrumentId: string): string {
  return ICON_PATHS[instrumentId] ?? ICON_PATHS.tabla;
}

/** Every id that has an emblem. Used by the icon-coverage test. */
export function iconIds(): string[] {
  return Object.keys(ICON_PATHS);
}
