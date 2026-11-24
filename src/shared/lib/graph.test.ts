import { describe, expect, it } from "vitest";
import { buildGraph, childrenOf, generations, siblingsOf, spousesOf } from "./graph";

const P = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, nick: null, g: "unknown", dob: null, dobp: "unknown", ord: null,
  alive: true, dod: null, photo: null, uid: null, mgr: null, state: null, ...extra,
});

// thatha + paati -> appa, chithappa ; appa + amma -> me, thambi ; me + wife -> kid
// wife's parents: w_appa + w_amma
const raw = {
  persons: [
    P("thatha"), P("paati"), P("appa", { ord: 1 }), P("chithappa", { ord: 2 }), P("amma"),
    P("me", { dob: "1990-01-01" }), P("thambi", { dob: "1995-01-01" }), P("wife"), P("kid"),
    P("w_appa"), P("w_amma"), P("stranger"),
  ],
  parents: [
    ["thatha", "appa", "biological"], ["paati", "appa", "biological"],
    ["thatha", "chithappa", "biological"], ["paati", "chithappa", "biological"],
    ["appa", "me", "biological"], ["amma", "me", "biological"],
    ["appa", "thambi", "biological"], ["amma", "thambi", "biological"],
    ["me", "kid", "biological"], ["wife", "kid", "biological"],
    ["w_appa", "wife", "biological"], ["w_amma", "wife", "biological"],
  ],
  unions: [
    ["thatha", "paati", null, null, null], ["appa", "amma", null, null, null],
    ["me", "wife", "2015-05-01", null, null], ["w_appa", "w_amma", null, null, null],
  ],
};

describe("graph", () => {
  const g = buildGraph(raw);

  it("finds siblings elder first", () => {
    expect(siblingsOf(g, "chithappa")).toEqual(["appa"]);
    expect(siblingsOf(g, "me")).toEqual(["thambi"]);
    expect(childrenOf(g, "thatha")).toEqual(["appa", "chithappa"]);
  });

  it("finds spouses", () => {
    expect(spousesOf(g, "me").map((s) => s.id)).toEqual(["wife"]);
  });

  it("places generations relative to me, including in-laws", () => {
    const lv = generations(g, "me");
    expect(lv.get("me")).toBe(0);
    expect(lv.get("wife")).toBe(0);
    expect(lv.get("thambi")).toBe(0);
    expect(lv.get("appa")).toBe(-1);
    expect(lv.get("w_appa")).toBe(-1);
    expect(lv.get("chithappa")).toBe(-1);
    expect(lv.get("thatha")).toBe(-2);
    expect(lv.get("kid")).toBe(1);
    expect(lv.has("stranger")).toBe(true);
  });

  it("does not loop on uncle-niece marriage", () => {
    const g2 = buildGraph({
      persons: [P("thatha"), P("akka"), P("mama"), P("niece")],
      parents: [["thatha", "akka", "biological"], ["thatha", "mama", "biological"], ["akka", "niece", "biological"]],
      unions: [["mama", "niece", null, null, null]],
    });
    const lv = generations(g2, "mama");
    expect(lv.get("mama")).toBe(0);
    expect(lv.size).toBe(4);
  });

  it("handles empty input", () => {
    expect(buildGraph(null).persons.size).toBe(0);
  });
});
