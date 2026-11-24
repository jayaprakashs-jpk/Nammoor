import { describe, expect, it } from "vitest";
import { buildGraph } from "@/shared/lib/graph";
import { computeRelations, labelFor, relativeAge } from "./engine";

type P = { id: string; g: "male" | "female"; ord?: number; dob?: string; dead?: boolean };
const person = (p: P) => ({
  id: p.id, name: p.id, nick: null, g: p.g, dob: p.dob ?? null, dobp: p.dob ? "exact" : "unknown",
  ord: p.ord ?? null, alive: !p.dead, dod: null, photo: null, uid: null, mgr: null, state: null,
});

// A Tamil family. Me = "me" (male, 1990).
//
//  thatha+paati -> appa(1), chithappa(2), athai(3)
//  appa+amma -> akka(1985), me(1990), thambi(1995)
//  chithappa+chithi -> cuz(1992)         athai+athaiHub -> athaiSon
//  mThatha+mPaati -> mama(1), amma(2), mChithi(3)
//  mama+mami -> mamaDau     mChithi+mChithappa -> mChithiKid
//  me+wife -> kid   wife's parents wF+wM -> wife, wBro, wSis
const people: P[] = [
  { id: "thatha", g: "male" }, { id: "paati", g: "female" },
  { id: "appa", g: "male", ord: 1 }, { id: "chithappa", g: "male", ord: 2 }, { id: "athai", g: "female", ord: 3 },
  { id: "amma", g: "female", ord: 2 },
  { id: "akka", g: "female", dob: "1985-01-01" }, { id: "me", g: "male", dob: "1990-01-01" }, { id: "thambi", g: "male", dob: "1995-01-01" },
  { id: "chithi", g: "female" }, { id: "cuz", g: "male", dob: "1992-01-01" },
  { id: "athaiHub", g: "male" }, { id: "athaiSon", g: "male" },
  { id: "mThatha", g: "male" }, { id: "mPaati", g: "female" },
  { id: "mama", g: "male", ord: 1 }, { id: "mChithi", g: "female", ord: 3 },
  { id: "mami", g: "female" }, { id: "mamaDau", g: "female" },
  { id: "mChithappa", g: "male" }, { id: "mChithiKid", g: "female" },
  { id: "wife", g: "female", ord: 2 }, { id: "wF", g: "male" }, { id: "wM", g: "female" },
  { id: "wBro", g: "male", ord: 1 }, { id: "wSis", g: "female", ord: 3 },
  { id: "kid", g: "male", dob: "2018-01-01" }, { id: "akkaSon", g: "male" }, { id: "thambiSon", g: "male" },
  { id: "ggf", g: "male" }, { id: "gf", g: "male" }, // father of thatha, and thatha's own father line
  { id: "kidSon", g: "male" }, { id: "loner", g: "male" },
  { id: "kidWife", g: "female" }, { id: "kwF", g: "male" },
];
const parents: [string, string][] = [
  ["thatha", "appa"], ["paati", "appa"], ["thatha", "chithappa"], ["paati", "chithappa"], ["thatha", "athai"], ["paati", "athai"],
  ["appa", "akka"], ["amma", "akka"], ["appa", "me"], ["amma", "me"], ["appa", "thambi"], ["amma", "thambi"],
  ["chithappa", "cuz"], ["chithi", "cuz"], ["athaiHub", "athaiSon"], ["athai", "athaiSon"],
  ["mThatha", "mama"], ["mPaati", "mama"], ["mThatha", "amma"], ["mPaati", "amma"], ["mThatha", "mChithi"], ["mPaati", "mChithi"],
  ["mama", "mamaDau"], ["mami", "mamaDau"], ["mChithappa", "mChithiKid"], ["mChithi", "mChithiKid"],
  ["me", "kid"], ["wife", "kid"], ["wF", "wife"], ["wM", "wife"], ["wF", "wBro"], ["wM", "wBro"], ["wF", "wSis"], ["wM", "wSis"],
  ["akka", "akkaSon"], ["thambi", "thambiSon"], ["ggf", "thatha"], ["kid", "kidSon"],
];
parents.push(["kwF", "kidWife"]);
const unions: [string, string][] = [
  ["thatha", "paati"], ["appa", "amma"], ["chithappa", "chithi"], ["athai", "athaiHub"], ["mThatha", "mPaati"],
  ["mama", "mami"], ["mChithi", "mChithappa"], ["me", "wife"], ["wF", "wM"],
];
// My son "kid" is married to kidWife, whose father is kwF: tests Marumagal and Samandhi.
unions.push(["kid", "kidWife"]);

const raw = {
  persons: people.map(person),
  parents: parents.map(([a, b]) => [a, b, "biological"]),
  unions: unions.map(([a, b]) => [a, b, null, null, null]),
};
const g = buildGraph(raw as never);
const rel = computeRelations(g, "me");
const ta = (id: string) => labelFor(rel.get(id), "tamil").title;
const hi = (id: string) => labelFor(rel.get(id), "english_in").title;
const en = (id: string) => labelFor(rel.get(id), "english_global").title;

describe("Tamil relation names", () => {
  it("close family", () => {
    expect(ta("appa")).toBe("அப்பா");
    expect(ta("amma")).toBe("அம்மா");
    expect(ta("wife")).toBe("மனைவி");
    expect(ta("kid")).toBe("மகன்");
    expect(ta("akka")).toBe("அக்கா");
    expect(ta("thambi")).toBe("தம்பி");
  });
  it("grandparents on both sides", () => {
    expect(ta("thatha")).toBe("தாத்தா");
    expect(ta("mPaati")).toBe("பாட்டி");
    expect(ta("ggf")).toBe("கொள்ளுத் தாத்தா");
    expect(ta("kidSon")).toBe("பேரன்");
  });
  it("father's brothers: Periyappa or Chithappa decided by birth order", () => {
    expect(ta("chithappa")).toBe("சித்தப்பா"); // appa is #1, chithappa #2
    expect(ta("chithi")).toBe("சித்தி");
    expect(ta("athai")).toBe("அத்தை");
    expect(ta("athaiHub")).toBe("மாமா");
  });
  it("mother's side: Mama, Mami, and Chithi", () => {
    expect(ta("mama")).toBe("மாமா");
    expect(ta("mami")).toBe("மாமி");
    expect(ta("mChithi")).toBe("சித்தி"); // amma is #2, mChithi #3
    expect(ta("mChithappa")).toBe("சித்தப்பா");
  });
  it("flips to Periyappa when the brother is the elder", () => {
    const flipped = buildGraph({
      ...raw,
      persons: raw.persons.map((p) => (p.id === "appa" ? { ...p, ord: 2 } : p.id === "chithappa" ? { ...p, ord: 1 } : p)),
    } as never);
    const r = computeRelations(flipped, "me");
    expect(labelFor(r.get("chithappa"), "tamil").title).toBe("பெரியப்பா");
    expect(labelFor(r.get("chithi"), "tamil").title).toBe("பெரியம்மா");
  });
  it("without any age info it says both and asks for it", () => {
    const blank = buildGraph({
      ...raw,
      persons: raw.persons.map((p) => (["appa", "chithappa"].includes(p.id) ? { ...p, ord: null } : p)),
    } as never);
    const l = labelFor(computeRelations(blank, "me").get("chithappa"), "tamil");
    expect(l.title).toBe("பெரியப்பா / சித்தப்பா");
    expect(l.sub).toMatch(/birth order/i);
  });
  it("uses date of birth when birth order is missing", () => {
    const dobOnly = buildGraph({
      ...raw,
      persons: raw.persons.map((p) =>
        p.id === "appa" ? { ...p, ord: null, dob: "1960-01-01", dobp: "exact" }
        : p.id === "chithappa" ? { ...p, ord: null, dob: "1955-01-01", dobp: "exact" } : p),
    } as never);
    expect(labelFor(computeRelations(dobOnly, "me").get("chithappa"), "tamil").title).toBe("பெரியப்பா");
  });
  it("parallel cousins are brother and sister by age", () => {
    expect(ta("cuz")).toBe("தம்பி"); // born 1992, me 1990
    expect(rel.get("cuz")!.cousin).toBe(true);
    expect(en("cuz")).toBe("Cousin brother");
    expect(ta("mChithiKid")).toBe("சகோதரி"); // no dates: brother/sister, age unknown
  });
  it("cross cousins keep their own names", () => {
    expect(ta("mamaDau")).toBe("மாமா மகள்");
    expect(ta("athaiSon")).toBe("அத்தை மகன்");
  });
  it("in-laws", () => {
    expect(ta("wF")).toBe("மாமனார்");
    expect(ta("wM")).toBe("மாமியார்");
    expect(ta("wBro")).toBe("மச்சான்");
    expect(ta("wSis")).toBe("மச்சினி"); // wife is #2, her sister #3
    expect(ta("kidWife")).toBe("மருமகள்"); // son's wife
    expect(ta("kwF")).toBe("சம்மந்தி"); // son's wife's father
  });
  it("your corrected terms: younger brother's wife, wife's elder sister, husband's elder brother", () => {
    expect(ta("thambi")).toBe("தம்பி");
    const mk = (extraPersons: ReturnType<typeof person>[], parents: string[][], unions: (string | null)[][]) =>
      buildGraph({ persons: extraPersons, parents: parents.map((p) => [...p, "biological"]), unions } as never);
    // I have a younger brother (born 1995) with a wife
    const a = mk(
      [person({ id: "me2", g: "male", dob: "1990-01-01" }), person({ id: "bro", g: "male", dob: "1995-01-01" }), person({ id: "bw", g: "female" }), person({ id: "d", g: "male" })],
      [["d", "me2"], ["d", "bro"]], [["bro", "bw", null, null, null]],
    );
    expect(labelFor(computeRelations(a, "me2").get("bw"), "tamil").title).toBe("மைத்துனி");
    // my wife's elder sister, then younger sister
    const w = mk(
      [person({ id: "me3", g: "male" }), person({ id: "wf", g: "female", dob: "1992-01-01" }), person({ id: "sis1", g: "female", dob: "1988-01-01" }), person({ id: "sis2", g: "female", dob: "1996-01-01" }), person({ id: "dad", g: "male" })],
      [["dad", "wf"], ["dad", "sis1"], ["dad", "sis2"]], [["me3", "wf", null, null, null]],
    );
    const rw = computeRelations(w, "me3");
    expect(labelFor(rw.get("sis1"), "tamil").title).toBe("அக்கா");
    expect(labelFor(rw.get("sis2"), "tamil").title).toBe("மச்சினி");
    // my wife's age unknown: both names, plus a hint to add the age
    const u = mk(
      [person({ id: "me4", g: "male" }), person({ id: "wf4", g: "female" }), person({ id: "sis4", g: "female" }), person({ id: "dad4", g: "male" })],
      [["dad4", "wf4"], ["dad4", "sis4"]], [["me4", "wf4", null, null, null]],
    );
    expect(labelFor(computeRelations(u, "me4").get("sis4"), "tamil").title).toBe("அக்கா / மச்சினி");
    // my husband's elder brother (I am a woman)
    const h = mk(
      [person({ id: "she", g: "female" }), person({ id: "hus", g: "male", dob: "1990-01-01" }), person({ id: "hb", g: "male", dob: "1985-01-01" }), person({ id: "hd", g: "male" })],
      [["hd", "hus"], ["hd", "hb"]], [["she", "hus", null, null, null]],
    );
    expect(labelFor(computeRelations(h, "she").get("hb"), "tamil").title).toBe("அண்ணா");
  });
  it("nephews: sister's son is Marumagan, brother's son is Thambi magan (male speaker)", () => {
    expect(ta("akkaSon")).toBe("மருமகன்");
    expect(ta("thambiSon")).toBe("தம்பி மகன்");
  });
  it("a woman's sister's son is her own 'son-like' child", () => {
    const g2 = buildGraph({
      persons: [person({ id: "w", g: "female" }), person({ id: "s", g: "female", dob: "1990-01-01" }), person({ id: "ss", g: "male" }), person({ id: "mom", g: "female" })],
      parents: [["mom", "w", "biological"], ["mom", "s", "biological"], ["s", "ss", "biological"]],
      unions: [],
    } as never);
    const r = computeRelations(g2, "w");
    expect(r.get("ss")!.term!.tr).toMatch(/magan/);
    expect(r.get("ss")!.term!.tr).not.toBe("Marumagan");
  });
});

describe("other naming styles", () => {
  it("North Indian terms", () => {
    expect(hi("appa")).toBe("Pitaji");
    expect(hi("chithappa")).toBe("Chacha");
    expect(hi("athai")).toBe("Bua");
    expect(hi("mama")).toBe("Mama");
    expect(hi("wBro")).toBe("Saala");
  });
  it("global English with a plain explanation underneath", () => {
    expect(en("chithappa")).toBe("Uncle");
    expect(labelFor(rel.get("chithappa"), "english_global").sub).toMatch(/father's younger brother/i);
    expect(labelFor(rel.get("wBro"), "english_global").title).toBe("Brother-in-law");
  });
  it("Tamil style shows letters and English underneath", () => {
    const l = labelFor(rel.get("chithappa"), "tamil");
    expect(l.sub).toContain("Chithappa");
    expect(l.sub).toContain("Uncle");
  });
  it("falls back to plain English for chains with no name", () => {
    const l = labelFor(rel.get("kwF"), "tamil");
    expect(l.title.length).toBeGreaterThan(5);
  });
});

describe("sides, safety", () => {
  it("classifies sides", () => {
    expect(rel.get("me")!.side).toBe("self");
    for (const id of ["appa", "thatha", "chithappa", "athaiHub", "cuz", "ggf"]) expect(rel.get(id)!.side, id).toBe("paternal");
    for (const id of ["amma", "mama", "mami", "mChithappa", "mamaDau"]) expect(rel.get(id)!.side, id).toBe("maternal");
    for (const id of ["wife", "wF", "wBro"]) expect(rel.get(id)!.side, id).toBe("inlaw");
    for (const id of ["akka", "thambi", "kid", "kidSon", "akkaSon"]) expect(rel.get(id)!.side, id).toBe("own");
  });
  it("leaves out people who are not connected", () => {
    expect(rel.has("loner")).toBe(false);
  });
  it("ignores a divorced marriage when finding in-laws", () => {
    const d = buildGraph({
      persons: [person({ id: "a", g: "male" }), person({ id: "b", g: "female" }), person({ id: "bm", g: "female" })],
      parents: [["bm", "b", "biological"]],
      unions: [["a", "b", null, "2020-01-01", "divorce"]],
    } as never);
    expect(computeRelations(d, "a").has("bm")).toBe(false);
  });
  it("handles an uncle marrying his niece without looping", () => {
    const u = buildGraph({
      persons: ["thatha", "akka", "mama", "niece"].map((id, i) => person({ id, g: i % 2 ? "female" : "male" })),
      parents: [["thatha", "akka", "biological"], ["thatha", "mama", "biological"], ["akka", "niece", "biological"]],
      unions: [["mama", "niece", null, null, null]],
    } as never);
    const r = computeRelations(u, "mama");
    expect(r.get("niece")!.chain).toEqual(["W"]); // wife wins over niece
  });
  it("gives every connected person a relation, fast, on a big family", () => {
    const n = 3000;
    const persons = Array.from({ length: n }, (_, i) => person({ id: `p${i}`, g: i % 2 ? "female" : "male" }));
    const parentsBig: [string, string, string][] = [];
    const couple = [["p0", "p1", null, null, null]];
    for (let i = 2; i < n; i++) parentsBig.push([`p${Math.floor((i - 2) / 2)}`, `p${i}`, "biological"]);
    const big = buildGraph({ persons, parents: parentsBig, unions: couple } as never);
    const t0 = Date.now();
    const r = computeRelations(big, "p2000");
    expect(r.size).toBe(n);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe("relativeAge", () => {
  const a = person({ id: "a", g: "male", ord: 2, dob: "1990-01-01" });
  const b = person({ id: "b", g: "male", ord: 1, dob: "1995-01-01" });
  it("prefers birth order between siblings", () => expect(relativeAge(a as never, b as never, true)).toBe("e"));
  it("uses dates when birth order is off", () => expect(relativeAge(a as never, b as never, false)).toBe("y"));
  it("says unknown when nothing is known", () =>
    expect(relativeAge(person({ id: "x", g: "male" }) as never, person({ id: "y", g: "male" }) as never, true)).toBe("?"));
});
