import { describe, expect, it } from "vitest";
import { dayLabel, mergeMessages, newId, type Msg } from "./messages";

const m = (id: string, at: string, extra: Partial<Msg> = {}): Msg => ({
  id, room_id: "r", sender_id: "u", body: id, created_at: at, edited_at: null, deleted_at: null, ...extra,
});

describe("mergeMessages", () => {
  it("sorts oldest first", () => {
    const out = mergeMessages([m("b", "2026-01-02T00:00:00Z")], [m("a", "2026-01-01T00:00:00Z"), m("c", "2026-01-03T00:00:00Z")]);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("does not duplicate when the server echoes our own message", () => {
    const local = m("x", "2026-01-01T10:00:00Z", { state: "sending" });
    const out = mergeMessages([local], [m("x", "2026-01-01T10:00:01Z")]);
    expect(out).toHaveLength(1);
    expect(out[0].state).toBeUndefined();
    expect(out[0].created_at).toBe("2026-01-01T10:00:01Z");
  });
  it("applies a delete", () => {
    const out = mergeMessages([m("x", "2026-01-01T10:00:00Z")], [m("x", "2026-01-01T10:00:00Z", { body: null, deleted_at: "2026-01-01T11:00:00Z" })]);
    expect(out[0].deleted_at).not.toBeNull();
    expect(out[0].body).toBeNull();
  });
});

describe("labels and ids", () => {
  const now = new Date(2026, 10, 24, 12);
  it("names days", () => {
    expect(dayLabel(new Date(2026, 10, 24, 1).toISOString(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 10, 23, 23).toISOString(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 10, 1, 9).toISOString(), now)).toMatch(/1 Nov/);
  });
  it("makes valid v4 ids", () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(newId());
  });
});
