/**
 * Instrument roster and automatic allocation.
 *
 * One set, mixing Indian and Western voices without separating them, and
 * assignment that keeps the room's frequency range balanced as people arrive.
 * Allocation is deterministic so the server is the single source of truth and
 * clients can predict the same answer offline.
 */

/**
 * Families, named for the role a voice plays in the room rather than for its
 * organology. A participant is told "you are the ground", never "you are a
 * membranophone".
 */
export type Family = "rhythm" | "bass" | "bed" | "top";

/**
 * How instruments are grouped *for browsing*.
 *
 * Separate from `Family`, which is the musical machinery — what balances a room
 * and fills a song's roles. This is only for a person choosing, and it is named
 * in words an Indian crowd already uses rather than in anything a musician would
 * recognise. Nobody picking up a phone at a wedding is looking for "the
 * harmonic bed".
 */
export type Browse = "thaap" | "dhamaka" | "jhankaar" | "lehar" | "sur" | "masti";

export interface BrowseGroup {
  id: Browse;
  /** Devanagari, because it reads faster than a transliteration to most of them. */
  dev: string;
  label: string;
  /** What it sounds like, in the plainest words available. */
  hint: string;
}

export const BROWSE_GROUPS: readonly BrowseGroup[] = [
  { id: "thaap",    dev: "थाप",   label: "Thaap",    hint: "drums you hit with your hands" },
  { id: "dhamaka",  dev: "धमाका",  label: "Dhamaka",  hint: "the big low boom" },
  { id: "jhankaar", dev: "झंकार",  label: "Jhankaar", hint: "jingles, bells, bright little sounds" },
  { id: "lehar",    dev: "लहर",   label: "Lehar",    hint: "long floating notes underneath" },
  { id: "sur",      dev: "सुर",   label: "Sur",      hint: "the tune on top" },
  { id: "masti",    dev: "मस्ती",  label: "Masti",    hint: "claps and silly sounds" },
] as const;

export const FAMILY_COLOR: Record<Family, string> = {
  rhythm: "#ffaa33",
  bass: "#ff5638",
  bed: "#ff3d9a",
  top: "#3fe3cd",
};

/**
 * What each family is called, in words a non-musician reads once and gets.
 *
 * These used to be "the pulse", "the ground", "the weave" and "the voice" —
 * evocative, and nobody knew what "the weave" meant. Somebody handed an
 * instrument in a room full of strangers needs to understand their job
 * instantly, so plain beats poetic here.
 */
export const FAMILY_LABEL: Record<Family, string> = {
  rhythm: "Beat",
  bass: "Deep",
  bed: "Background",
  top: "Melody",
};

/** One line on what the family does, for the same reason. */
export const FAMILY_HINT: Record<Family, string> = {
  rhythm: "keeps time",
  bass: "the low boom",
  bed: "held notes underneath",
  top: "the tune on top",
};

export interface Instrument {
  id: string;
  name: string;
  /** Devanagari name, where the instrument has one. Shown beside the Latin. */
  dev?: string;
  /** How it behaves, in the player's language. Never music theory. */
  feel: string;
  family: Family;
  origin: "indian" | "western" | "global";
  /**
   * Pitched voices get a note chosen for them by the engine; unpitched ones
   * play a stroke sample. This decides which.
   */
  pitched: boolean;
  /** Sustained voices ring on past their onset and respond to the swipe. */
  sustains: boolean;
  /** Which browsing group this sits in. See `Browse`. */
  browse: Browse;
  /**
   * Octave offset from the room's root.
   *
   * Only meaningful for pitch-shifted voices. The kit is all real recordings
   * played at the pitch they were captured — the tuned ones are already in D and
   * agree with each other — so nothing currently uses this.
   */
  octave?: number;
}

/** Emblem for an instrument. One per id — see icons.ts. */
export function instrumentIcon(id: string): string {
  return id;
}

export const INSTRUMENTS: readonly Instrument[] = [
  /* ---- Beat ----------------------------------------------------- */
  { id: "tabla",   name: "Tabla",      dev: "तबला",   feel: "sharp and ringing",   family: "rhythm", origin: "indian",  pitched: false, sustains: false, browse: "thaap" },
  { id: "dholak",  name: "Dholak",     dev: "ढोलक",   feel: "rolling and low",     family: "rhythm", origin: "indian",  pitched: false, sustains: false, browse: "thaap" },
  { id: "claps",   name: "Hand Claps",                feel: "hands together",      family: "rhythm", origin: "global",  pitched: false, sustains: false, browse: "masti" },
  { id: "stomp",   name: "Stomp",                     feel: "foot on the ground",  family: "rhythm", origin: "global",  pitched: false, sustains: false, browse: "masti" },
  { id: "shaker",  name: "Shaker",                    feel: "steady shimmer",      family: "rhythm", origin: "global",  pitched: false, sustains: false, browse: "jhankaar" },
  { id: "kartal",  name: "Kartal",     dev: "करताल",  feel: "dry wooden clack",    family: "rhythm", origin: "indian",  pitched: false, sustains: false, browse: "jhankaar" },
  { id: "manjira", name: "Manjira",    dev: "मंजीरा",  feel: "bright ringing metal",family: "rhythm", origin: "indian",  pitched: false, sustains: false, browse: "jhankaar" },

  /* ---- Deep ----------------------------------------------------- */
  { id: "dhol",    name: "Dhol",       dev: "ढोल",    feel: "the deep floor",      family: "bass",   origin: "indian",  pitched: false, sustains: false, browse: "dhamaka" },
  { id: "bass",    name: "Bass",                      feel: "low and round",       family: "bass",   origin: "western", pitched: false, sustains: true,  browse: "dhamaka" },

  /* ---- Background ----------------------------------------------- */
  { id: "guitar",  name: "Guitar",                    feel: "warm open strum",     family: "bed",    origin: "western", pitched: false, sustains: true,  browse: "lehar" },

  /* ---- Melody --------------------------------------------------- */
  { id: "sitar",   name: "Sitar",      dev: "सितार",  feel: "buzzing strings",     family: "top",    origin: "indian",  pitched: false, sustains: true,  browse: "sur" },
] as const;

export function getInstrument(id: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}

export function instrumentLabel(i: Instrument): string {
  return i.dev ? `${i.name} / ${i.dev}` : i.name;
}

/* ------------------------------------------------------------------ *
 * Group size buckets
 * ------------------------------------------------------------------ */

export type GroupSize = "small" | "medium" | "large";

export interface GroupSizeOption {
  id: GroupSize;
  label: string;
  sub: string;
  min: number;
  max: number;
}

/** The three choices named in the brief: 3-8, 9-30, 30+. */
export const GROUP_SIZES: readonly GroupSizeOption[] = [
  { id: "small",  label: "3–8",  sub: "a room",   min: 3,  max: 8 },
  { id: "medium", label: "9–30", sub: "a circle", min: 9,  max: 30 },
  { id: "large",  label: "30+",  sub: "a crowd",  min: 31, max: 80 },
] as const;

/**
 * Target share of the room per family, per group size.
 *
 * Small rooms need a high proportion of rhythm or they sound thin; large rooms
 * need proportionally more melody, or the low end turns to mud once thirty
 * phones are all playing drums into the same air.
 */
const FAMILY_TARGETS: Record<GroupSize, Record<Family, number>> = {
  small:  { rhythm: 0.50, bass: 0.17, bed: 0.16, top: 0.17 },
  medium: { rhythm: 0.45, bass: 0.10, bed: 0.20, top: 0.25 },
  large:  { rhythm: 0.40, bass: 0.08, bed: 0.22, top: 0.30 },
};

export function groupSizeFor(count: number): GroupSize {
  if (count <= 8) return "small";
  if (count <= 30) return "medium";
  return "large";
}

const FAMILY_ORDER: readonly Family[] = ["rhythm", "bass", "bed", "top"];

/**
 * Instruments the allocator will never hand out unprompted.
 *
 * Empty for now: every sound in the kit is one a stranger can be handed without
 * surprise. Novelty voices, if any are ever added back, belong here.
 */
const OPT_IN_ONLY = new Set<string>();

/**
 * Choose the instrument that best balances the room.
 *
 * Picks the family furthest below its target share, then the least-used
 * instrument within it. Duplicates are permitted, as the brief requires — they
 * are simply the last resort rather than the first choice.
 *
 * @param taken instrument ids already assigned, in join order
 * @param expectedSize the room's declared size, which sets the target ratios
 */
export function allocateInstrument(
  taken: readonly string[],
  expectedSize: GroupSize,
): Instrument {
  const targets = FAMILY_TARGETS[expectedSize];
  const total = taken.length;

  const counts: Record<Family, number> = { rhythm: 0, bass: 0, bed: 0, top: 0 };
  for (const id of taken) {
    const inst = getInstrument(id);
    if (inst) counts[inst.family] += 1;
  }

  // Largest shortfall against target wins. With an empty room every family has
  // the same zero share, so FAMILY_ORDER breaks the tie toward rhythm.
  let bestFamily: Family = FAMILY_ORDER[0];
  let bestDeficit = -Infinity;
  for (const family of FAMILY_ORDER) {
    const share = total === 0 ? 0 : counts[family] / total;
    const deficit = targets[family] - share;
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestFamily = family;
    }
  }

  const candidates = INSTRUMENTS.filter(
    (i) => i.family === bestFamily && !OPT_IN_ONLY.has(i.id),
  );
  const usage = new Map<string, number>();
  for (const inst of candidates) usage.set(inst.id, 0);
  for (const id of taken) {
    if (usage.has(id)) usage.set(id, (usage.get(id) ?? 0) + 1);
  }

  // Least-used first; INSTRUMENTS order breaks ties, keeping this deterministic.
  let chosen = candidates[0];
  let lowest = Infinity;
  for (const inst of candidates) {
    const used = usage.get(inst.id) ?? 0;
    if (used < lowest) {
      lowest = used;
      chosen = inst;
    }
  }
  return chosen;
}

/**
 * What to offer in the swap sheet.
 *
 * Ordered by how much the room still needs each family, so the first thing a
 * player sees is the voice that would help most — "the circle offers only the
 * voices it needs". Everything stays reachable; nothing is hidden.
 */
export function swapOptions(
  taken: readonly string[],
  expectedSize: GroupSize,
  currentId: string | null,
): Instrument[] {
  const targets = FAMILY_TARGETS[expectedSize];
  const total = taken.length;
  const counts: Record<Family, number> = { rhythm: 0, bass: 0, bed: 0, top: 0 };
  for (const id of taken) {
    const inst = getInstrument(id);
    if (inst) counts[inst.family] += 1;
  }
  const deficit = (f: Family) =>
    targets[f] - (total === 0 ? 0 : counts[f] / total);

  return [...INSTRUMENTS].sort((a, b) => {
    if (a.id === currentId) return -1;
    if (b.id === currentId) return 1;
    const d = deficit(b.family) - deficit(a.family);
    if (Math.abs(d) > 1e-6) return d;
    return INSTRUMENTS.indexOf(a) - INSTRUMENTS.indexOf(b);
  });
}
