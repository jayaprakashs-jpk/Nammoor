import { describe, expect, it } from "vitest";
import { buildGraph, generations } from "@/shared/lib/graph";
import { CARD, layoutTree } from "./layout";

const P = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, nick: null, g: "male", dob: null, dobp: "unknown", ord: null,
  alive: true, dod: null, photo: null, uid: null, mgr: null, state: null, ...extra,
});

// gp+gm -> dad, unc ; dad+mom -> me, sis, bro ; unc+aunt -> cuz1, cuz2 ; me+wife -> kid
const raw = {
  persons: ["gp", "gm", "dad", "unc", "mom", "me", "sis", "bro", "aunt", "cuz1", "cuz2", "wife", "kid"].map((id) => P(id)),
  parents: [
    ["gp", "dad"], ["gm", "dad"], ["gp", "unc"], ["gm", "unc"], ["dad", "me"], ["mom", "me"], ["dad", "sis"], ["mom", "sis"],
    ["dad", "bro"], ["mom", "bro"], ["unc", "cuz1"], ["aunt", "cuz1"], ["unc", "cuz2"], ["aunt", "cuz2"], ["me", "kid"], ["wife", "kid"],
  ].map(([a, b]) => [a, b, "biological"]),
  unions: [["gp", "gm"], ["dad", "mom"], ["unc", "aunt"], ["me", "wife"]].map(([a, b]) => [a, b, null, null, null]),
};
const g = buildGraph(raw as never);
const all = new Set(g.persons.keys());
const layout = layoutTree(g, all, generations(g, "me"));
const box = (id: string) => layout.boxes.get(id)!;

describe("layoutTree", () => {
  it("puts every person on the canvas exactly once", () => {
    expect(layout.boxes.size).toBe(all.size);
    for (const b of layout.boxes.values()) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + CARD.w).toBeLessThanOrEqual(layout.width);
      expect(b.y + CARD.h).toBeLessThanOrEqual(layout.height);
    }
  });
  it("puts each generation on its own row, parents above children", () => {
    expect(box("gp").y).toBeLessThan(box("dad").y);
    expect(box("dad").y).toBeLessThan(box("me").y);
    expect(box("me").y).toBeLessThan(box("kid").y);
    expect(box("dad").y).toBe(box("unc").y);
    expect(box("me").y).toBe(box("wife").y);
  });
  it("never overlaps cards in a row", () => {
    const byRow = new Map<number, { x: number }[]>();
    for (const b of layout.boxes.values()) byRow.set(b.row, [...(byRow.get(b.row) ?? []), b]);
    for (const row of byRow.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) expect(row[i].x - row[i - 1].x).toBeGreaterThanOrEqual(CARD.w);
    }
  });
  it("keeps partners next to each other", () => {
    for (const [a, b] of [["gp", "gm"], ["dad", "mom"], ["unc", "aunt"], ["me", "wife"]])
      expect(Math.abs(box(a).x - box(b).x)).toBe(CARD.w + CARD.pair);
  });
  it("keeps brothers and sisters together and the cousins apart from them", () => {
    const sibs = ["me", "sis", "bro"].map((i) => box(i).x).sort((a, b) => a - b);
    const cuz = ["cuz1", "cuz2"].map((i) => box(i).x);
    expect(sibs[2] - sibs[0]).toBeLessThan(Math.min(...cuz.map((c) => Math.abs(c - sibs[0]))) + CARD.w * 4);
    expect(new Set([...sibs, ...cuz]).size).toBe(5);
  });
  it("draws a line from every child to its parents and one per couple", () => {
    expect(layout.links.length).toBe(["dad", "unc", "me", "sis", "bro", "cuz1", "cuz2", "kid"].length);
    expect(layout.couples.length).toBe(4);
  });
  it("is the same every time", () => {
    const again = layoutTree(g, all, generations(g, "me"));
    expect([...again.boxes.values()]).toEqual([...layout.boxes.values()]);
  });
  it("works for a filtered subset and for an empty set", () => {
    const some = layoutTree(g, new Set(["me", "dad", "gp"]), generations(g, "me"));
    expect(some.boxes.size).toBe(3);
    expect(some.links.length).toBe(2);
    expect(layoutTree(g, new Set(), new Map()).boxes.size).toBe(0);
  });
  it("lays out 500 people fast", () => {
    const persons = Array.from({ length: 500 }, (_, i) => P(`p${i}`));
    const parents: string[][] = [];
    for (let i = 2; i < 500; i++) parents.push([`p${Math.floor((i - 2) / 3)}`, `p${i}`, "biological"]);
    const big = buildGraph({ persons, parents, unions: [] } as never);
    const t0 = Date.now();
    const l = layoutTree(big, new Set(big.persons.keys()), generations(big, "p0"));
    expect(l.boxes.size).toBe(500);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
