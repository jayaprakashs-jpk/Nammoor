import { describe, expect, it } from "vitest";
import { buildGraph } from "@/shared/lib/graph";
import { DEFAULT_LIST, filterPeople, placesIn } from "./people";
import { ancestorSlots, FAN, generationOfSlot, layoutFan, layoutPedigree, parentPair, PED } from "./ancestors";

const P = (id: string, g: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, nick: null, g, dob: null, dobp: "unknown", ord: null, alive: true, dod: null, dodp: "unknown",
  photo: null, uid: null, mgr: null, state: null, np: null, ...extra,
});
// me <- dad(m), mom(f);  dad <- gf(m), gm(f);  mom <- mgf(m)  (mom's mother missing);  gf <- ggf
const g = buildGraph({
  persons: [P("me", "male"), P("dad", "male"), P("mom", "female"), P("gf", "male"), P("gm", "female"), P("mgf", "male"), P("ggf", "male")],
  parents: [["dad", "me"], ["mom", "me"], ["gf", "dad"], ["gm", "dad"], ["mgf", "mom"], ["ggf", "gf"]].map(([a, b]) => [a, b, "biological"]),
  unions: [],
} as never);

describe("ancestor slots", () => {
  const s = ancestorSlots(g, "me", 4);
  it("numbers like a pedigree chart: father 2, mother 3, father's father 4...", () => {
    expect(s.get(1)).toBe("me");
    expect(s.get(2)).toBe("dad");
    expect(s.get(3)).toBe("mom");
    expect(s.get(4)).toBe("gf");
    expect(s.get(5)).toBe("gm");
    expect(s.get(6)).toBe("mgf");
    expect(s.get(7)).toBeNull(); // mother's mother is unknown
    expect(s.get(8)).toBe("ggf");
  });
  it("has exactly 2^depth - 1 slots", () => expect(s.size).toBe(15));
  it("depth is limited", () => expect(ancestorSlots(g, "me", 99).size).toBe(2 ** 7 - 1));
  it("depth 1 is just the person; unknown person gives nothing", () => {
    expect([...ancestorSlots(g, "me", 1).values()]).toEqual(["me"]);
    expect(ancestorSlots(g, "nobody", 3).size).toBe(0);
  });
  it("generation of a slot", () => expect([1, 2, 3, 4, 7, 8, 15].map(generationOfSlot)).toEqual([0, 1, 1, 2, 2, 3, 3]));
  it("a parent of unknown gender takes the free place; two of the same gender are not lost", () => {
    const u = buildGraph({ persons: [P("k", "male"), P("x", "unknown"), P("y", "male"), P("z", "male")], parents: [["y", "k"], ["z", "k"]].map(([a, b]) => [a, b, "biological"]), unions: [] } as never);
    const [f, m] = parentPair(u, "k");
    expect(new Set([f, m])).toEqual(new Set(["y", "z"]));
  });
  it("biological parents come before step parents", () => {
    const u = buildGraph({ persons: [P("k", "male"), P("a", "female"), P("b", "female")], parents: [["a", "k", "step"], ["b", "k", "biological"]], unions: [] } as never);
    expect(parentPair(u, "k")[1]).toBe("b");
  });
});

describe("pedigree layout", () => {
  const l = layoutPedigree(ancestorSlots(g, "me", 4), 4);
  it("shows people plus an Add card only where a child exists", () => {
    expect(l.nodes.filter((n) => n.id).length).toBe(7);
    const ph = l.nodes.filter((n) => n.placeholder);
    expect(ph.map((n) => [n.slot, n.role, n.childId])).toEqual(
      expect.arrayContaining([[7, "mother", "mom"], [9, "mother", "gf"], [10, "father", "gm"], [11, "mother", "gm"], [12, "father", "mgf"], [13, "mother", "mgf"]].map((x) => expect.arrayContaining(x))),
    );
    expect(l.nodes.some((n) => n.slot === 14 || n.slot === 15)).toBe(false); // nothing hangs off the missing mother's mother
  });
  it("puts you on the left and ancestors further right, no overlaps in a column", () => {
    const by = new Map<number, number[]>();
    for (const n of l.nodes) by.set(generationOfSlot(n.slot), [...(by.get(generationOfSlot(n.slot)) ?? []), n.y]);
    for (const ys of by.values()) {
      ys.sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(PED.h);
    }
    expect(l.nodes.find((n) => n.slot === 1)!.x).toBeLessThan(l.nodes.find((n) => n.slot === 2)!.x);
    for (const n of l.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + PED.h).toBeLessThanOrEqual(l.height);
      expect(n.x + PED.w).toBeLessThanOrEqual(l.width);
    }
  });
  it("father above mother", () => {
    const y = (slot: number) => l.nodes.find((n) => n.slot === slot)!.y;
    expect(y(2)).toBeLessThan(y(3));
  });
  it("draws one link per person-with-a-child", () => expect(l.links.length).toBe(l.nodes.length - 1));
});

describe("fan layout", () => {
  const l = layoutFan(ancestorSlots(g, "me", 4), 4);
  it("has a segment for every slot except the centre", () => expect(l.segments.length).toBe(14));
  it("stays inside its canvas", () => {
    for (const s of l.segments) {
      expect(s.tx).toBeGreaterThan(0);
      expect(s.tx).toBeLessThan(l.width);
      expect(s.ty).toBeGreaterThan(0);
      expect(s.ty).toBeLessThanOrEqual(l.cy);
    }
  });
  it("fathers on the left half, mothers on the right", () => {
    expect(l.segments.find((s) => s.slot === 2)!.tx).toBeLessThan(l.cx);
    expect(l.segments.find((s) => s.slot === 3)!.tx).toBeGreaterThan(l.cx);
  });
  it("outer text is never upside down", () => {
    for (const s of l.segments.filter((x) => x.ring >= 3)) expect(Math.abs(s.rot)).toBeLessThanOrEqual(90.0001);
  });
  it("outer rings are further from the centre", () => {
    const dist = (slot: number) => { const s = l.segments.find((x) => x.slot === slot)!; return Math.hypot(s.tx - l.cx, s.ty - l.cy); };
    expect(dist(4)).toBeGreaterThan(dist(2));
    expect(dist(8)).toBeGreaterThan(dist(4));
    expect(dist(2)).toBeGreaterThan(FAN.centre);
  });
});

describe("people list filters", () => {
  const people = buildGraph({
    persons: [
      P("a", "male", { name: "Anbu", np: "Madurai", dob: "1950-01-01", dobp: "exact" }),
      P("b", "female", { name: "Bhavani", np: "madurai ", dob: "1990-05-05", dobp: "exact" }),
      P("c", "male", { name: "Chinnasamy", np: "Thanjavur", alive: false, dod: "2001-01-01", dob: "1930-01-01", dobp: "year" }),
      P("d", "female", { name: "Devi", nick: "Kutty" }),
      P("e", "male", { name: "Elango", np: "Thanjavur" }),
    ],
    parents: [], unions: [],
  } as never);
  const all = ["a", "b", "c", "d", "e"];
  const run = (o: Partial<typeof DEFAULT_LIST>) => filterPeople(people, all, { ...DEFAULT_LIST, ...o });
  it("searches names, nicknames and places", () => {
    expect(run({ query: "kutty" })).toEqual(["d"]);
    expect(run({ query: "thanj" })).toEqual(["c", "e"]);
    expect(run({ query: "  BHAV " })).toEqual(["b"]);
  });
  it("filters by native place ignoring case and spaces", () => expect(run({ place: "Madurai" })).toEqual(["a", "b"]));
  it("filters living and deceased", () => {
    expect(run({ status: "deceased" })).toEqual(["c"]);
    expect(run({ status: "living" })).toEqual(["a", "b", "d", "e"]);
  });
  it("finds people with no birth date", () => expect(run({ missingBirthDate: true })).toEqual(["d", "e"]));
  it("combines filters", () => expect(run({ place: "Thanjavur", status: "living" })).toEqual(["e"]));
  it("sorts by name, oldest, youngest (no date last), place", () => {
    expect(run({ sort: "name" })).toEqual(["a", "b", "c", "d", "e"]);
    expect(run({ sort: "oldest" })).toEqual(["c", "a", "b", "d", "e"]);
    expect(run({ sort: "youngest" })).toEqual(["b", "a", "c", "d", "e"]);
    expect(run({ sort: "place" })).toEqual(["a", "b", "c", "e", "d"]);
  });
  it("lists places most common first", () => expect(placesIn(people)).toEqual(["Madurai", "Thanjavur"]));
});
