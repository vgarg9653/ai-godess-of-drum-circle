import { describe, expect, it } from "vitest";
import { HOST_GRACE_MS, nextHost, type Participant } from "@godc/shared";

function who(
  id: string,
  joinedAt: number,
  extra: Partial<Participant> = {},
): Participant {
  return {
    id,
    name: id,
    instrumentId: "tabla",
    isHost: false,
    joinedAt,
    connected: true,
    ...extra,
  };
}

describe("nextHost", () => {
  it("passes the circle to whoever has been here longest", () => {
    const room = [
      who("host", 1000, { isHost: true }),
      who("late", 5000),
      who("early", 2000),
      who("middle", 3000),
    ];
    expect(nextHost(room, "host")?.id).toBe("early");
  });

  it("never picks the person who is leaving", () => {
    const room = [who("host", 1000, { isHost: true }), who("other", 4000)];
    expect(nextHost(room, "host")?.id).toBe("other");
  });

  it("skips participants who are themselves offline", () => {
    // Handing the circle to a phone that is also gone just moves the problem.
    const room = [
      who("host", 1000, { isHost: true }),
      who("offline", 1500, { connected: false }),
      who("online", 4000),
    ];
    expect(nextHost(room, "host")?.id).toBe("online");
  });

  it("returns nobody when the room is empty of anyone eligible", () => {
    expect(nextHost([who("host", 1000, { isHost: true })], "host")).toBeUndefined();
    expect(
      nextHost(
        [who("host", 1000, { isHost: true }), who("gone", 2000, { connected: false })],
        "host",
      ),
    ).toBeUndefined();
  });

  it("breaks a same-millisecond tie the same way every time", () => {
    // Two people joining in one millisecond is rare but a room of sixty phones
    // makes it possible, and every device must land on the same answer.
    const a = [who("host", 1, { isHost: true }), who("zoe", 500), who("amit", 500)];
    const b = [who("host", 1, { isHost: true }), who("amit", 500), who("zoe", 500)];
    expect(nextHost(a, "host")?.id).toBe("amit");
    expect(nextHost(b, "host")?.id).toBe(nextHost(a, "host")?.id);
  });

  it("is stable across repeated calls", () => {
    const room = [who("host", 1, { isHost: true }), who("a", 9), who("b", 4)];
    const first = nextHost(room, "host")?.id;
    for (let i = 0; i < 5; i++) expect(nextHost(room, "host")?.id).toBe(first);
  });

  it("gives a vanished host a generous grace period", () => {
    // A locked screen must not cost a facilitator their own session.
    expect(HOST_GRACE_MS).toBeGreaterThanOrEqual(30_000);
  });
});
