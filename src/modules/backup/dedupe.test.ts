import { describe, expect, it } from "vitest";
import { buildGraph } from "@/shared/lib/graph";
import { findMatches, nameKey, planImport, toPayload, type Choice } from "./dedupe";
import type { ImportData, ImportPerson } from "./types";

const G = (id: string, name: string, g: string, extra: Record<string, unknown> = {}) => ({
  id, name, nick: null, g, dob: null, dobp: "unknown", ord: null, alive: true, dod: null, dodp: "unknown", photo: null, uid: null, mgr: null, state: null, np: null, ...extra,
});
const I = (ref: string, name: string, gender = "unknown", extra: Partial<ImportPerson> = {}): ImportPerson => ({
  ref, full_name: name, gender: gender as never, birth_date: null, birth_precision: "unknown", birth_time: null, birth_place: null, birth_order: null,
  is_living: true, death_date: null, death_precision: "unknown", native_place: null, current_city: null, state_code: null, country_code: null,
  history: null, nickname: null, initials: null, name_native: null, education: [], occupations: [], ...extra,
});
const data = (persons: ImportPerson[], parents: ImportData["parents"] = [], unions: ImportData["unions"] = []): ImportData => ({ source: "gedcom", familyName: null, persons, parents, unions, warnings: [] });

const g = buildGraph({
  persons: [G("e1", "S. Ramasamy", "male", { dob: "1950-01-01", dobp: "year" }), G("e2", "Murugan", "male"), G("e3", "Lakshmi", "female", { dob: "1955-06-15", dobp: "exact" }), G("kid", "Kid", "male"), G("mom", "Mom", "female"), G("dad", "Dad", "male")],
  parents: [["dad", "kid", "biological"], ["mom", "kid", "biological"]], unions: [["dad", "mom", null, null, null, "unknown"]],
} as never);

describe("duplicate check", () => {
  it("ignores case, dots, spaces and punctuation, in any language", () => {
    expect(nameKey("S. Ramasamy")).toBe(nameKey("s ramasamy"));
    expect(nameKey("இராமசாமி")).toBe(nameKey(" இராமசாமி "));
    expect(nameKey("Ramasamy")).not.toBe(nameKey("Ramasami"));
  });
  const m = findMatches(g, data([
    I("a", "s ramasamy", "male", { birth_date: "1950-07-07", birth_precision: "exact" }), // same name, same year
    I("b", "Murugan", "male"), // same name, no years to compare
    I("c", "Lakshmi", "female", { birth_date: "1990-01-01", birth_precision: "exact" }), // same name, DIFFERENT year: another person
    I("d", "Lakshmi", "male"), // same name, different gender
    I("e", "Somebody New", "male"),
  ]));
  it("same name and birth year is a sure match", () => expect(m.get("a")).toEqual({ id: "e1", confidence: "same" }));
  it("same name with no years to compare is only a maybe", () => expect(m.get("b")).toEqual({ id: "e2", confidence: "maybe" }));
  it("different birth years mean different people", () => expect(m.has("c")).toBe(false));
  it("different gender means different people", () => expect(m.has("d")).toBe(false));
  it("new names have no match", () => expect(m.has("e")).toBe(false));
  it("one existing person is matched only once, and a sure match wins over a vague one", () => {
    const two = findMatches(g, data([I("v", "Murugan", "male"), I("w", "Murugan", "male")]));
    expect([...two.values()].filter((x) => x.id === "e2")).toHaveLength(1);
    const pref = findMatches(g, data([I("vague", "S. Ramasamy", "male"), I("sure", "S Ramasamy", "male", { birth_date: "1950-01-01", birth_precision: "year" })]));
    expect(pref.get("sure")!.confidence).toBe("same");
    expect(pref.has("vague")).toBe(false);
  });
});

describe("import plan", () => {
  const none = new Map<string, Choice>();
  it("counts what will be added", () => {
    const d = data([I("p", "New Parent", "male"), I("c", "New Child")], [["p", "c", "biological"]], [{ a: "p", b: "c", married_on: null, married_precision: "unknown", ended_on: null, end_reason: null }]);
    expect(planImport(g, d, new Map(), none)).toMatchObject({ added: 2, linked: 0, newParentLinks: 1, newMarriages: 1, errors: [] });
  });
  it("linking an existing person counts as linked, not added", () => {
    const d = data([I("a", "S Ramasamy", "male"), I("k", "Son")], [["a", "k", "biological"]]);
    const m = findMatches(g, d);
    const plan = planImport(g, d, m, new Map([["a", "link"]]));
    expect(plan).toMatchObject({ added: 1, linked: 1, newParentLinks: 1 });
  });
  it("a link that already exists is not counted again", () => {
    const d = data([I("d", "Dad", "male"), I("k", "Kid", "male")], [["d", "k", "biological"]], [{ a: "d", b: "d", married_on: null, married_precision: "unknown", ended_on: null, end_reason: null }]);
    const m = new Map([["d", { id: "dad", confidence: "same" as const }], ["k", { id: "kid", confidence: "same" as const }]]);
    expect(planImport(g, d, m, new Map<string, Choice>([["d", "link"], ["k", "link"]])).newParentLinks).toBe(0);
  });
  it("refuses a third biological parent", () => {
    const d = data([I("x", "Extra Parent", "male"), I("k", "Kid", "male")], [["x", "k", "biological"]]);
    const m = new Map([["k", { id: "kid", confidence: "same" as const }]]);
    const plan = planImport(g, d, m, new Map<string, Choice>([["k", "link"]]));
    expect(plan.errors[0]).toMatch(/Kid would have 3 biological parents/);
  });
  it("allows an adopted third parent", () => {
    const d = data([I("x", "Adoptive", "male"), I("k", "Kid", "male")], [["x", "k", "adopted"]]);
    const m = new Map([["k", { id: "kid", confidence: "same" as const }]]);
    expect(planImport(g, d, m, new Map<string, Choice>([["k", "link"]])).errors).toEqual([]);
  });
  it("refuses someone becoming their own ancestor", () => {
    const d = data([I("a", "A"), I("b", "B"), I("c", "C")], [["a", "b", "biological"], ["b", "c", "biological"], ["c", "a", "biological"]]);
    expect(planImport(g, d, new Map(), none).errors[0]).toMatch(/own ancestor/);
  });
  it("catches a cycle that goes through someone already in the family", () => {
    const d = data([I("k", "Kid", "male"), I("d", "Dad", "male")], [["k", "d", "biological"]]);
    const m = new Map([["k", { id: "kid", confidence: "same" as const }], ["d", { id: "dad", confidence: "same" as const }]]);
    expect(planImport(g, d, m, new Map<string, Choice>([["k", "link"], ["d", "link"]])).errors.join()).toMatch(/own ancestor/);
  });
  it("builds the payload the database expects", () => {
    const d = data([I("a", "S Ramasamy", "male"), I("n", "New")], [["a", "n", "biological"]], [{ a: "a", b: "n", married_on: "2000-01-01", married_precision: "exact", ended_on: null, end_reason: null }]);
    const m = findMatches(g, d);
    const p = toPayload(d, m, new Map([["a", "link"]]));
    expect(p.persons[0].existing).toBe("e1");
    expect(p.persons[1].existing).toBeNull();
    expect(p.parents).toEqual([["a", "n", "biological"]]);
    expect(p.unions[0]).toEqual(["a", "n", "2000-01-01", "exact", null, null]);
  });
});
