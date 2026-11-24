import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph";
import { computeInsights } from "./insights";
import { buildTimeline, upcomingReminders } from "./timeline";

const P = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, nick: null, g: "male", dob: null, dobp: "unknown", ord: null, alive: true,
  dod: null, dodp: "unknown", photo: null, uid: null, mgr: null, state: null, np: null, ...extra,
});
const today = new Date(2026, 10, 24); // 24 Nov 2026

const g = buildGraph({
  persons: [
    P("a", { dob: "1940-06-01", dobp: "exact", np: "Thanjavur" }),
    P("b", { dob: "1945-01-01", dobp: "year", np: " thanjavur " }),
    P("c", { dob: "1970-11-27", dobp: "exact", np: "Madurai" }),
    P("d", { dob: "1972-02-29", dobp: "exact" }),
    P("e", { alive: false, dob: "1900-01-01", dobp: "year", dod: "1970-11-25", dodp: "exact", np: "Madurai" }),
    P("f", { alive: false, dod: "1999-01-01", dodp: "year" }),
    P("g"),
  ],
  parents: [],
  unions: [
    ["a", "b", "1965-11-30", null, null, "exact"],
    ["c", "d", "2000-12-30", null, null, "exact"],
    ["e", "f", "1925-01-01", null, "death", "year"],
  ],
} as never);

describe("insights", () => {
  const i = computeInsights(g, today);
  it("counts people", () => {
    expect(i.total).toBe(7);
    expect(i.living).toBe(5);
    expect(i.deceased).toBe(2);
    expect(i.missingBirthDate).toBe(2); // f and g
    expect(i.marriages).toBe(3);
  });
  it("finds the oldest living person (born 1940 -> 86)", () => expect(i.oldestLiving).toEqual({ id: "a", years: 86, approx: false }));
  it("ignores the dead when looking for the oldest", () => expect(i.oldestLiving?.id).not.toBe("e"));
  it("groups places ignoring case and spaces, most common first", () => {
    expect(i.topPlaces).toEqual([{ place: "Madurai", count: 2 }, { place: "Thanjavur", count: 2 }]); // tie: A to Z, capital spelling wins
  });
  it("copes with an empty family", () => {
    const e = computeInsights(buildGraph(null), today);
    expect(e).toMatchObject({ total: 0, living: 0, oldestLiving: null, topPlaces: [] });
  });
});

describe("timeline", () => {
  const t = buildTimeline(g);
  it("is in date order and skips unknown dates", () => {
    const years = t.map((e) => e.year);
    expect(years).toEqual([...years].sort((x, y) => x - y));
    expect(t.some((e) => e.people.includes("g"))).toBe(false);
  });
  it("has births, marriages and deaths once each", () => {
    expect(t.filter((e) => e.kind === "birth")).toHaveLength(5);
    expect(t.filter((e) => e.kind === "marriage")).toHaveLength(3);
    expect(t.filter((e) => e.kind === "death")).toHaveLength(2);
  });
  it("keeps the exact day only when known", () => {
    expect(t.find((e) => e.kind === "birth" && e.people[0] === "b")!.date).toBeNull();
    expect(t.find((e) => e.kind === "birth" && e.people[0] === "a")!.date).toBe("1940-06-01");
  });
});

describe("upcoming reminders", () => {
  const r = upcomingReminders(g, today, 30);
  it("lists a birthday in 3 days with the age being turned", () => {
    const b = r.find((x) => x.kind === "birthday" && x.people[0] === "c")!;
    expect(b).toMatchObject({ inDays: 3, years: 56, on: "2026-11-27" });
  });
  it("lists an anniversary for a marriage still going", () => {
    expect(r.find((x) => x.kind === "anniversary" && x.people.includes("a"))).toMatchObject({ inDays: 6, years: 61 });
  });
  it("lists a death anniversary as remembrance, not birthday", () => {
    expect(r.find((x) => x.kind === "remembrance")).toMatchObject({ inDays: 1, years: 56, people: ["e"] });
    expect(r.some((x) => x.kind === "birthday" && x.people[0] === "e")).toBe(false);
  });
  it("ignores year-only dates (no exact day to remind about)", () => {
    expect(r.some((x) => x.people[0] === "b" && x.kind === "birthday")).toBe(false);
    expect(r.some((x) => x.people.includes("f"))).toBe(false);
  });
  it("is sorted soonest first and respects the window", () => {
    expect(r.map((x) => x.inDays)).toEqual([...r.map((x) => x.inDays)].sort((x, y) => x - y));
    expect(upcomingReminders(g, today, 2).every((x) => x.inDays <= 2)).toBe(true);
  });
  it("shows today as 0 days", () => {
    expect(upcomingReminders(g, new Date(2026, 10, 27), 0).find((x) => x.people[0] === "c")!.inDays).toBe(0);
  });
  it("29 Feb birthday falls on 28 Feb in a normal year and 29 Feb in a leap year", () => {
    expect(upcomingReminders(g, new Date(2027, 1, 20), 30).find((x) => x.people[0] === "d")!.on).toBe("2027-02-28");
    expect(upcomingReminders(g, new Date(2028, 1, 20), 30).find((x) => x.people[0] === "d")!.on).toBe("2028-02-29");
  });
  it("rolls over the new year", () => {
    const x = upcomingReminders(g, new Date(2026, 11, 20), 30).find((y) => y.kind === "anniversary" && y.people.includes("c"));
    expect(x).toMatchObject({ on: "2026-12-30", years: 26 });
    expect(upcomingReminders(g, new Date(2026, 11, 28), 10).find((y) => y.people[0] === "a" && y.kind === "birthday")).toBeUndefined();
  });
  it("does not remind about a birth that is today as 'turning 0'", () => {
    const born = buildGraph({ persons: [P("n", { dob: "2026-11-24", dobp: "exact" })], parents: [], unions: [] } as never);
    expect(upcomingReminders(born, today, 30)).toEqual([]);
  });
});
