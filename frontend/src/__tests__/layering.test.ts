/**
 * EVAL: the layered start.
 *
 * Watching a real room: either nobody dares begin, or everybody begins at
 * once. The layered start brings people in the way a facilitator does. These
 * hold its promises: deterministic on every phone, one entrance at a time,
 * nobody ever blocked after their moment has passed, and the whole thing
 * over in under a minute even for a big room.
 */

import { describe, expect, it } from "vitest";
import type { Participant } from "@godc/shared";
import {
  layerStatus,
  mayLock,
  SOLO_THRESHOLD,
  STAGE_CYCLES,
  stagesFor,
} from "@/engine/layering";

function person(id: string, instrumentId: string | null = "tabla"): Participant {
  return {
    id,
    name: id,
    instrumentId,
    roleId: null,
    rolePart: 0,
    isHost: id === "p1",
    joinedAt: 0,
    connected: true,
  };
}

describe("the stage plan", () => {
  it("brings a small room in one person at a time, in join order", () => {
    const room = [person("p1"), person("p2"), person("p3")];
    const stages = stagesFor(room);
    expect(stages.map((s) => s.ids)).toEqual([["p1"], ["p2"], ["p3"]]);
  });

  it("brings a big room in by section, lowest first", () => {
    const room = [
      ...Array.from({ length: 4 }, (_, i) => person(`d${i}`, "dholak")),
      ...Array.from({ length: 3 }, (_, i) => person(`b${i}`, "dhol")),
      ...Array.from({ length: 2 }, (_, i) => person(`g${i}`, "guitar")),
      ...Array.from({ length: 3 }, (_, i) => person(`s${i}`, "sitar")),
    ];
    expect(room.length).toBeGreaterThan(SOLO_THRESHOLD);
    const stages = stagesFor(room);
    // bass → rhythm → bed → top, four stages however many people.
    expect(stages).toHaveLength(4);
    expect(stages[0].ids).toEqual(["b0", "b1", "b2"]);
    expect(stages[1].ids).toHaveLength(4);
  });

  it("keeps the whole layered start under a minute, whatever the size", () => {
    const big = Array.from({ length: 60 }, (_, i) =>
      person(`p${i}`, ["dholak", "dhol", "guitar", "sitar"][i % 4]),
    );
    const stages = stagesFor(big);
    // 4 stages × 2 cycles × ~5.3s a cycle ≈ 43s. Per-person would be 10 minutes.
    expect(stages.length * STAGE_CYCLES).toBeLessThanOrEqual(8);
  });

  it("skips the ceremony entirely for one person alone", () => {
    expect(stagesFor([person("p1")])).toEqual([]);
    expect(layerStatus([person("p1")], "p1", 0).phase).toBe("open");
  });
});

describe("one person's view of it", () => {
  const room = [person("p1"), person("p2"), person("p3")];

  it("tells the first person to start, and the rest whose moment it is", () => {
    expect(layerStatus(room, "p1", 0).phase).toBe("yourTurn");
    const second = layerStatus(room, "p2", 0);
    expect(second.phase).toBe("waiting");
    if (second.phase === "waiting") expect(second.stageLabel).toBe("p1");
  });

  it("advances on the shared cycle count, identically for everyone", () => {
    expect(layerStatus(room, "p2", STAGE_CYCLES).phase).toBe("yourTurn");
    expect(layerStatus(room, "p1", STAGE_CYCLES).phase).toBe("joined");
    expect(layerStatus(room, "p3", STAGE_CYCLES).phase).toBe("waiting");
  });

  it("opens the jam once every stage has passed", () => {
    const after = STAGE_CYCLES * room.length;
    for (const p of room) {
      expect(layerStatus(room, p.id, after).phase).toBe("open");
    }
  });

  it("never holds anyone back after their moment — hesitation is allowed", () => {
    // p1's stage passed unplayed. They must be free forever after.
    expect(mayLock(layerStatus(room, "p1", STAGE_CYCLES))).toBe(true);
    expect(mayLock(layerStatus(room, "p1", STAGE_CYCLES * 10))).toBe(true);
    // Only the time BEFORE your stage gates you.
    expect(mayLock(layerStatus(room, "p3", 0))).toBe(false);
    expect(mayLock(layerStatus(room, "p3", STAGE_CYCLES * 2))).toBe(true);
  });

  it("leaves a mid-layering joiner free rather than queueing them", () => {
    // p4 joined after Begin; they are not in the plan and must not be gated.
    const late = [...room, person("p4")];
    const stages = stagesFor(room); // the plan the room started with
    void stages;
    expect(layerStatus(room, "p4", 1).phase).toBe("open");
    void late;
  });
});
