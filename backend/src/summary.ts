/**
 * The closing summary, built per recipient.
 *
 * `you` carries only the viewer's own figures. `room` carries only what belongs
 * to everyone: totals, the roster as names, and the weave aggregated by
 * instrument family. The brief forbids ranking or comparison between people,
 * so this structure deliberately has no field capable of expressing another
 * participant's numbers — keeping that impossible-by-shape is the point.
 */

import {
  getInstrument,
  gridSteps,
  type Family,
  type SessionSummary,
} from "@godc/shared";
import type { ServerRoom } from "./rooms.js";

const FAMILIES: Family[] = ["rhythm", "bass", "bed", "top"];

export function buildSummary(
  sroom: ServerRoom,
  forParticipantId: string,
): SessionSummary {
  const { room } = sroom;
  const endedAt = room.endedAt ?? Date.now();
  const durationMs = Math.max(0, endedAt - (sroom.playStartedAt ?? room.createdAt));
  const you = room.participants.find((p) => p.id === forParticipantId);
  const yourPhrase = room.phrases[forParticipantId];

  const steps = gridSteps(room.transport.cycleBeats);
  const weave: Record<string, number[]> = {};
  for (const family of FAMILIES) weave[family] = new Array(steps).fill(0);

  let totalOnsets = 0;
  for (const [participantId, phrase] of Object.entries(room.phrases)) {
    totalOnsets += phrase.onsets.length;
    const participant = room.participants.find((p) => p.id === participantId);
    const family = participant?.instrumentId
      ? getInstrument(participant.instrumentId)?.family
      : undefined;
    if (!family) continue;
    for (const onset of phrase.onsets) {
      if (onset.step >= 0 && onset.step < steps) weave[family][onset.step] += 1;
    }
  }

  const cycleSeconds =
    (60 / room.transport.bpm) * room.transport.cycleBeats;

  return {
    roomCode: room.code,
    durationMs,
    participantCount: room.participants.length,
    you: {
      instrumentId: you?.instrumentId ?? null,
      presentMs: Math.max(0, endedAt - (you?.joinedAt ?? room.createdAt)),
      onsetsPlayed: yourPhrase?.onsets.length ?? 0,
      revisions: sroom.updateCounts.get(forParticipantId) ?? 0,
    },
    room: {
      totalOnsets,
      instrumentsUsed: [
        ...new Set(
          room.participants
            .map((p) => p.instrumentId)
            .filter((id): id is string => id !== null),
        ),
      ],
      cyclesCompleted: Math.max(0, Math.floor(durationMs / 1000 / cycleSeconds)),
      roster: room.participants.map((p) => ({
        name: p.name,
        instrumentId: p.instrumentId,
      })),
      weave,
    },
  };
}
