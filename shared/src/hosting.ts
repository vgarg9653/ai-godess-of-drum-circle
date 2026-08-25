/**
 * Who tends the circle.
 *
 * The host holds the only irreversible controls — tempo, cycle, mood, and
 * ending the session. If they walk out with their phone, the room must not be
 * left with nobody able to close it.
 *
 * The rule is pure and deterministic so the server and every client compute the
 * same answer, exactly like instrument allocation. Reimplementing it on one side
 * is how two devices end up disagreeing about who is in charge.
 */

import type { Participant } from "./protocol.js";

/**
 * How long a vanished host keeps the room before it passes to someone else.
 *
 * The brief is explicit that a participant who goes quiet is *present*, not
 * absent — a locked screen or a walk to the loo must not cost you your circle.
 * So this is deliberately generous, and matches the disconnect grace period for
 * ordinary participants. A room briefly without a reachable host is a smaller
 * problem than a facilitator losing control of their own session.
 */
export const HOST_GRACE_MS = 60_000;

/**
 * The participant who should inherit the circle.
 *
 * Longest-present wins: whoever has been in the room the longest is most likely
 * to be the facilitator's co-organiser, and is least likely to be a stranger who
 * wandered in at minute nineteen.
 *
 * Only *connected* participants are eligible. Handing the circle to a phone that
 * is itself offline would simply move the problem.
 *
 * @param participants everyone currently in the room, including the departing host
 * @param departingId the host who is leaving, excluded from the result
 * @returns the new host, or undefined when nobody is left to take it
 */
export function nextHost(
  participants: readonly Participant[],
  departingId: string,
): Participant | undefined {
  const eligible = participants.filter(
    (p) => p.id !== departingId && p.connected,
  );
  if (eligible.length === 0) return undefined;

  return eligible.reduce((earliest, candidate) => {
    if (candidate.joinedAt !== earliest.joinedAt) {
      return candidate.joinedAt < earliest.joinedAt ? candidate : earliest;
    }
    // Two people joined in the same millisecond. Break the tie on id so the
    // server and every client land on the same person rather than on whichever
    // order their copy of the array happened to be in.
    return candidate.id < earliest.id ? candidate : earliest;
  });
}

/** Why the circle changed hands. Shown to the room, so keep it truthful. */
export type HostChangeReason = "left" | "disconnected";
