import { describe, expect, it } from "vitest";
import type { Atom, Relation, Side } from "@/modules/relations/engine";
import { layoutRound, NODE } from "./round";

const rel = (chain: Atom[], side: Side): Relation => ({ chain, term: null, desc: "", side, cousin: false });
const people = [
  { id: "dad", rel: rel(["F"], "paternal") },
  { id: "mom", rel: rel(["M"], "maternal") },
  { id: "wife", rel: rel(["W"], "inlaw") },
  { id: "kid", rel: rel(["S"], "own") },
  ...Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, rel: rel(["F", "eB", "S"], "paternal") })),
];

describe("layoutRound", () => {
  const l = layoutRound(people);
  it("places everyone once, inside the canvas", () => {
    expect(l.dots.length).toBe(people.length);
    for (const d of l.dots) {
      expect(Math.abs(d.x) + NODE).toBeLessThanOrEqual(l.size / 2);
      expect(Math.abs(d.y) + NODE).toBeLessThanOrEqual(l.size / 2);
    }
  });
  it("father's side left, mother's side right, spouse on top, children below", () => {
    const at = (id: string) => l.dots.find((d) => d.id === id)!;
    expect(at("dad").x).toBeLessThan(0);
    expect(at("mom").x).toBeGreaterThan(0);
    expect(at("wife").y).toBeLessThan(0);
    expect(at("kid").y).toBeGreaterThan(0);
  });
  it("keeps close relatives on inner rings", () => {
    expect(l.dots.find((d) => d.id === "dad")!.ring).toBe(1);
    expect(l.dots.find((d) => d.id === "c0")!.ring).toBe(3);
  });
  it("does not stack a crowded ring on top of itself", () => {
    const ring3 = l.dots.filter((d) => d.ring === 3);
    for (let i = 0; i < ring3.length; i++)
      for (let j = i + 1; j < ring3.length; j++) {
        const dist = Math.hypot(ring3[i].x - ring3[j].x, ring3[i].y - ring3[j].y);
        expect(dist).toBeGreaterThan(NODE * 2);
      }
  });
  it("keeps the sectors apart where they meet (spouse's family vs grandparents)", () => {
    const mixed = layoutRound([
      { id: "in1", rel: rel(["W", "F"], "inlaw") }, { id: "in2", rel: rel(["W", "M"], "inlaw") },
      { id: "pg", rel: rel(["F", "F"], "paternal") }, { id: "mg", rel: rel(["M", "F"], "maternal") },
      { id: "ch", rel: rel(["S", "S"], "own") },
    ]);
    for (let i = 0; i < mixed.dots.length; i++)
      for (let j = i + 1; j < mixed.dots.length; j++)
        expect(Math.hypot(mixed.dots[i].x - mixed.dots[j].x, mixed.dots[i].y - mixed.dots[j].y)).toBeGreaterThan(NODE * 2 + 10);
  });
  it("handles nobody", () => expect(layoutRound([]).dots).toEqual([]));
});
