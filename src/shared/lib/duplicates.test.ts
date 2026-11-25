import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph";
import { candidateFrom, closeRelatives, compareNames, findLikelyDuplicates } from "./duplicates";

const P = (id: string, name: string, g: string, extra: Record<string, unknown> = {}) => ({
  id, name, nick: null, g, dob: null, dobp: "unknown", ord: null, alive: true, dod: null, dodp: "unknown", photo: null, uid: null, mgr: null, state: null, np: null, ...extra,
});
const y = (year: number) => ({ dob: `${year}-01-01`, dobp: "year" });
const g = buildGraph({
  persons: [
    P("r", "Ramasamy", "male", { ...y(1950), np: "Madurai" }),
    P("rk", "Ramasamy Kumar", "male", { ...y(1952), np: "Thanjavur" }),
    P("m", "Murugan", "male"),
    P("l", "Lakshmi", "female", { ...y(1955), np: "Madurai" }),
    P("son", "Ramasamy", "male", { ...y(1980), np: "Madurai" }),
    P("dad", "S. Kumarasamy Pillai", "male", y(1925)),
  ],
  parents: [["r", "son", "biological"]], unions: [],
} as never);
const find = (c: Parameters<typeof findLikelyDuplicates>[1], exclude: string[] = []) => findLikelyDuplicates(g, c, { exclude });

describe("name comparison", () => {
  it("ignores case, dots, spacing and one-letter initials", () => {
    expect(compareNames("S. Ramasamy", "ramasamy")).toBe("exact");
    expect(compareNames("RAMASAMY  ", "Ramasamy")).toBe("exact");
    expect(compareNames("இராமசாமி", " இராமசாமி ")).toBe("exact");
  });
  it("a short name inside a longer one", () => expect(compareNames("Ramasamy", "Ramasamy Kumar")).toBe("contained"));
  it("one letter off in a longer name is a likely spelling difference", () => {
    expect(compareNames("Ramasamy", "Ramasami")).toBe("similar");
    expect(compareNames("Kumarasamy", "Kumarasami")).toBe("similar");
  });
  it("short names must match exactly (Anbu is not Anju)", () => {
    expect(compareNames("Anbu", "Anju")).toBeNull();
    expect(compareNames("Murugan", "Suresh")).toBeNull();
  });
});

describe("likely duplicates", () => {
  it("same name, born within 3 years: a likely duplicate, explained in words", () => {
    const [m] = find({ name: "Ramasamy", birthYear: 1951 });
    expect(m.id).toBe("r");
    expect(m.confidence).toBe("high");
    expect(m.reasons).toEqual(expect.arrayContaining(["same name", "born 1 year apart"]));
  });
  it("the +/- 3 year window", () => {
    expect(find({ name: "Murugan", birthYear: null }).map((x) => x.id)).toEqual(["m"]);
    expect(find({ name: "Ramasamy", birthYear: 1953 }, ["son", "rk"]).map((x) => x.id)).toEqual(["r"]); // 3 years: yes
    expect(find({ name: "Ramasamy", birthYear: 1954 }, ["son", "rk"])).toEqual([]); // 4 years: no
  });
  it("native place adds weight, and a different place lowers it", () => {
    const same = find({ name: "Ramasamy", birthYear: 1950, nativePlace: " madurai " }, ["son"]);
    expect(same[0].reasons).toContain("same native place");
    const other = find({ name: "Ramasamy", birthYear: 1950, nativePlace: "Kerala" }, ["son"]);
    expect(other[0].confidence).toBe("possible");
    expect(other[0].score).toBeLessThan(same[0].score);
  });
  it("no birth year known: only a 'possible'", () => {
    const [m] = find({ name: "Murugan", birthYear: null });
    expect(m.confidence).toBe("possible");
  });
  it("a different gender is a different person", () => {
    expect(find({ name: "Lakshmi", birthYear: 1955, gender: "male" })).toEqual([]);
    expect(find({ name: "Lakshmi", birthYear: 1955, gender: "female" })[0].id).toBe("l");
  });
  it("father and son with the same name are not flagged when the relatives are excluded", () => {
    const rel = closeRelatives(g, "son");
    expect(rel.has("r")).toBe(true);
    expect(findLikelyDuplicates(g, candidateFrom(g.persons.get("son")!), { exclude: rel }).map((x) => x.id)).not.toContain("r");
  });
  it("misspelling still found", () => expect(find({ name: "Ramasami", birthYear: 1950 }, ["son"])[0].id).toBe("r"));
  it("best first, at most 3, nothing for an empty name", () => {
    const many = buildGraph({ persons: Array.from({ length: 6 }, (_, i) => P(`p${i}`, "Murugan", "male")), parents: [], unions: [] } as never);
    expect(findLikelyDuplicates(many, { name: "Murugan", birthYear: null })).toHaveLength(3);
    expect(find({ name: "   ", birthYear: null })).toEqual([]);
  });
  it("only ever reads the graph it is given (one family)", () => {
    const other = buildGraph({ persons: [P("x", "Ramasamy", "male", y(1950))], parents: [], unions: [] } as never);
    expect(findLikelyDuplicates(other, { name: "Ramasamy", birthYear: 1950 }).map((m) => m.id)).toEqual(["x"]);
    expect(find({ name: "Ramasamy", birthYear: 1950 }, ["son"]).map((m) => m.id)).not.toContain("x");
  });
  it("is fast on a big tree", () => {
    const big = buildGraph({ persons: Array.from({ length: 3000 }, (_, i) => P(`b${i}`, `Person ${i} Kumar`, "male", y(1900 + (i % 100)))), parents: [], unions: [] } as never);
    const t0 = Date.now();
    findLikelyDuplicates(big, { name: "Person 1234 Kumar", birthYear: 1934 });
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
