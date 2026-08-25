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

export const FAMILY_COLOR: Record<Family, string> = {
  rhythm: "#ffaa33",
  bass: "#ff5638",
  bed: "#ff3d9a",
  top: "#3fe3cd",
};

export const FAMILY_LABEL: Record<Family, string> = {
  rhythm: "the pulse",
  bass: "the ground",
  bed: "the weave",
  top: "the voice",
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
  /**
   * Octave offset from the room's root.
   *
   * This is what stops a room of sustained voices turning to porridge. Four
   * "bed" instruments all holding notes in the same octave read as one blurry
   * chord however different their timbres are; spread them across registers and
   * each one has somewhere of its own to sit.
   */
  octave?: number;
}

/** Emblem for an instrument. One per id — see icons.ts. */
export function instrumentIcon(id: string): string {
  return id;
}

export const INSTRUMENTS: readonly Instrument[] = [
  /* ---- rhythm --------------------------------------------------- */
  { id: "tabla",        name: "Tabla",        dev: "तबला",       feel: "sharp accents",     family: "rhythm", origin: "indian",  pitched: false, sustains: false },
  { id: "dholak",       name: "Dholak",       dev: "ढोलक",       feel: "rolling and low",   family: "rhythm", origin: "indian",  pitched: false, sustains: false },
  { id: "ghatam",       name: "Ghatam",       dev: "घटम्",        feel: "hollow and dry",    family: "rhythm", origin: "indian",  pitched: false, sustains: false },
  { id: "kanjira",      name: "Kanjira",      dev: "कंजीरा",      feel: "bright and quick",  family: "rhythm", origin: "indian",  pitched: false, sustains: false },
  { id: "djembe",       name: "Djembe",                          feel: "deep and round",    family: "rhythm", origin: "global",  pitched: false, sustains: false },
  { id: "cajon",        name: "Cajón",                           feel: "woody and close",   family: "rhythm", origin: "western", pitched: false, sustains: false },
  { id: "conga",        name: "Conga",                           feel: "open and warm",     family: "rhythm", origin: "western", pitched: false, sustains: false },
  { id: "frameDrum",    name: "Frame Drum",                      feel: "soft and wide",     family: "rhythm", origin: "global",  pitched: false, sustains: false },
  { id: "shaker",       name: "Shaker",                          feel: "steady shimmer",    family: "rhythm", origin: "global",  pitched: false, sustains: false },
  { id: "claves",       name: "Claves",                          feel: "dry and cutting",   family: "rhythm", origin: "western", pitched: false, sustains: false },
  { id: "woodblock",    name: "Woodblock",                       feel: "tight and small",   family: "rhythm", origin: "global",  pitched: false, sustains: false },
  { id: "manjira",      name: "Manjira",      dev: "मंजीरा",      feel: "ringing metal",     family: "rhythm", origin: "indian",  pitched: false, sustains: false },
  { id: "agogo",        name: "Agogo Bells",                     feel: "clear and high",    family: "rhythm", origin: "global",  pitched: false, sustains: false },
  { id: "claps",        name: "Hand Claps",                      feel: "hands together",    family: "rhythm", origin: "global",  pitched: false, sustains: false },
  { id: "beatbox",      name: "Beatbox",                         feel: "mouth and breath",  family: "rhythm", origin: "global",  pitched: false, sustains: false },

  /* ---- bass ----------------------------------------------------- */
  { id: "bayan",        name: "Bayan",        dev: "बायाँ",       feel: "deep and slow",     family: "bass",   origin: "indian",  pitched: false, sustains: false },
  { id: "bassPulse",    name: "Bass",                            feel: "the floor",         family: "bass",   origin: "western", pitched: true,  sustains: true,  octave: -1 },
  { id: "taiko",        name: "Taiko",                           feel: "huge and rare",     family: "bass",   origin: "global",  pitched: true,  sustains: false, octave: -1 },

  /* ---- bed ------------------------------------------------------ *
   * Four bed voices, deliberately laid out so they cannot blur into one
   * another: tanpura an octave down as the floor, harmonium in the middle,
   * Voices an octave up and airy, Rhodes struck rather than held. Same register
   * and same articulation is what makes four different timbres sound alike.  */
  { id: "tanpura",      name: "Tanpura",      dev: "तानपूरा",     feel: "endless drone",     family: "bed",    origin: "indian",  pitched: true,  sustains: true,  octave: -1 },
  { id: "harmonium",    name: "Harmonium",    dev: "हारमोनियम",   feel: "warm and reedy",    family: "bed",    origin: "indian",  pitched: true,  sustains: true,  octave: 0 },
  { id: "warmPad",      name: "Voices",                          feel: "held and human",    family: "bed",    origin: "global",  pitched: true,  sustains: true,  octave: 1 },
  { id: "rhodes",       name: "Rhodes Keys",                     feel: "bell-like keys",    family: "bed",    origin: "western", pitched: true,  sustains: false, octave: 0 },

  /* ---- top ------------------------------------------------------ */
  { id: "sitar",        name: "Sitar",        dev: "सितार",      feel: "buzzing strings",   family: "top",    origin: "indian",  pitched: true,  sustains: false, octave: 0 },
  { id: "bansuri",      name: "Bansuri",      dev: "बांसुरी",     feel: "breath and air",    family: "top",    origin: "indian",  pitched: true,  sustains: true,  octave: 1 },
  { id: "shehnai",      name: "Shehnai",      dev: "शहनाई",      feel: "reedy and keen",    family: "top",    origin: "indian",  pitched: true,  sustains: true,  octave: 0 },
  { id: "santoor",      name: "Santoor",      dev: "संतूर",      feel: "hammered shimmer",  family: "top",    origin: "indian",  pitched: true,  sustains: false, octave: 0 },
  { id: "kalimba",      name: "Kalimba",                         feel: "small and round",   family: "top",    origin: "global",  pitched: true,  sustains: false, octave: 1 },
  { id: "marimba",      name: "Marimba",                         feel: "wooden and mellow", family: "top",    origin: "western", pitched: true,  sustains: false, octave: 0 },
  { id: "glockenspiel", name: "Glockenspiel",                    feel: "glassy and high",   family: "top",    origin: "western", pitched: true,  sustains: false, octave: 1 },
  { id: "koto",         name: "Koto",                            feel: "plucked and open",  family: "top",    origin: "global",  pitched: true,  sustains: false, octave: 0 },
  { id: "birds",        name: "Birdsong",                        feel: "flitting and odd",  family: "top",    origin: "global",  pitched: true,  sustains: false, octave: 2 },
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
 * Birdsong and beatbox are wonderful when someone chooses them and startling
 * when a room of strangers is assigned them. They stay one tap away in the swap
 * sheet, which is where a deliberate choice belongs.
 */
const OPT_IN_ONLY = new Set(["birds", "beatbox"]);

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
