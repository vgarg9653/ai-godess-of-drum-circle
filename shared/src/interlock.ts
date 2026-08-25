/**
 * Sharing a role's pattern out among the people playing it.
 *
 * This is the piece that lets one arrangement serve a room of five and a room
 * of sixty. The naive approach — everyone in a role plays the whole pattern —
 * fails twice over:
 *
 *  - **It breaks the density guarantee.** A thirty-person room allows three
 *    onsets per person; a song pattern has six to ten. One person literally
 *    cannot play their part, and if they did, sixty phones playing dense
 *    patterns is the mud the brief exists to prevent.
 *  - **It erases the individual.** Twelve phones playing identical loops in one
 *    room comb-filter against each other, and nobody has a part of their own.
 *
 * So the pattern is *interlocked* instead: split between the people in the role,
 * so together they play the whole thing and each plays a few hits. This is how
 * large ensembles have always worked — Balinese kotekan, West African bell
 * patterns — and it scales by subdividing rather than by thinning.
 *
 * It also makes the room robust: no single person owns the pattern, so nobody
 * dropping out or drifting can take it away.
 *
 * Everything here is pure and deterministic. Server and client must agree on
 * who plays what, exactly as they do for instrument allocation.
 */

import { maxOnsets } from "./music.js";
import type { Onset } from "./protocol.js";
import type { RoleDef, Song } from "./songs.js";

/**
 * Which role a newcomer takes.
 *
 * Roles fill in priority order until each has someone, then even out. A room of
 * five gets the five parts that carry the piece's identity; a room of sixty
 * spreads evenly across all of them.
 *
 * @param takenRoleIds roles already assigned, in join order
 */
export function assignRole(song: Song, takenRoleIds: readonly string[]): RoleDef {
  const byPriority = [...song.roles].sort((a, b) => a.priority - b.priority);

  // Nobody in this role yet? Fill it before doubling up on anything.
  for (const role of byPriority) {
    if (!takenRoleIds.includes(role.id)) return role;
  }

  const counts = new Map<string, number>();
  for (const role of byPriority) counts.set(role.id, 0);
  for (const id of takenRoleIds) {
    if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  // Fewest members wins; priority order breaks ties, so it stays deterministic.
  let chosen = byPriority[0];
  let lowest = Infinity;
  for (const role of byPriority) {
    const n = counts.get(role.id) ?? 0;
    if (n < lowest) {
      lowest = n;
      chosen = role;
    }
  }
  return chosen;
}

/** How many people are already in a role, which is a newcomer's slice index. */
export function memberIndexFor(
  takenRoleIds: readonly string[],
  roleId: string,
): number {
  return takenRoleIds.filter((id) => id === roleId).length;
}

/**
 * The hits one person plays out of their role's pattern.
 *
 * Anchors go to everyone in the role — they are the hits that hold the cycle
 * together, usually beat one, and a room where only one person plays the
 * downbeat has a fragile pulse. Everything else is dealt out round-robin.
 *
 * When a role has more people than spare hits, members past the end double up
 * on an existing hit rather than being left with only the anchor. Two people in
 * unison is reinforcement; four people playing nothing but the downbeat is four
 * people without a part.
 *
 * @param memberIndex 0-based position within the role
 * @param memberCount how many people share this role
 * @param participantCount whole room, which sets the density cap
 */
export function distributeRole(
  role: RoleDef,
  memberIndex: number,
  memberCount: number,
  participantCount: number,
  cycleBeats: number,
): Onset[] {
  const members = Math.max(1, memberCount);
  const index = Math.max(0, memberIndex) % members;

  const sorted = [...role.pattern].sort((a, b) => a.step - b.step);
  const anchors = sorted.filter((h) => h.anchor);
  const rest = sorted.filter((h) => !h.anchor);

  let mine = rest.filter((_, i) => i % members === index);

  // More people than hits: double up rather than hand someone an empty part.
  if (mine.length === 0 && rest.length > 0) {
    mine = [rest[index % rest.length]];
  }

  const chosen = [...anchors, ...mine];

  // The density cap is the room's, not the arrangement's. If a part somehow
  // still exceeds it, drop decoration from the end and keep the anchors —
  // losing a grace note is survivable, losing the downbeat is not.
  const cap = maxOnsets(participantCount, cycleBeats);
  const capped =
    chosen.length > cap
      ? [...anchors, ...mine.slice(0, Math.max(0, cap - anchors.length))]
      : chosen;

  return capped
    .map((h) => ({
      step: h.step,
      velocity: h.velocity ?? 0.85,
      stroke: h.stroke,
      ...(h.degree !== undefined ? { degree: h.degree } : {}),
    }))
    .sort((a, b) => a.step - b.step);
}

/**
 * The whole role's pattern as the room should hear it, for checking coverage.
 *
 * Used by tests and by the arrangement validator: if the union of everyone's
 * parts is not the full pattern, the piece is not actually being played.
 */
export function unionOfParts(
  role: RoleDef,
  memberCount: number,
  participantCount: number,
  cycleBeats: number,
): Set<number> {
  const steps = new Set<number>();
  for (let i = 0; i < Math.max(1, memberCount); i++) {
    for (const onset of distributeRole(role, i, memberCount, participantCount, cycleBeats)) {
      steps.add(onset.step);
    }
  }
  return steps;
}
