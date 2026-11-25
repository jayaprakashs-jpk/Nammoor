import { describe, expect, it } from "vitest";
import { buildGraph } from "@/shared/lib/graph";
import { buildBookInput, layoutBook } from "./book";
import { fitText, wrapLines, type Cmd, type Measure } from "./commands";
import { buildPdf, PAGE_PT } from "./pdf";
import { pathPoints, planPoster, posterPeople } from "./poster";

// a fake ruler: every letter is half the font size wide, so tests do not need a browser
const measure: Measure = (t, size) => [...t].length * size * 0.5;

const P = (id: string, name: string, g: string, extra: Record<string, unknown> = {}) => ({
  id, name, nick: null, g, dob: null, dobp: "unknown", ord: null, alive: true, dod: null, dodp: "unknown", photo: null, uid: null, mgr: null, state: null, np: null, nt: null, ...extra,
});
const graph = buildGraph({
  persons: [
    P("gp", "Rangasamy", "male", { dob: "1925-01-01", dobp: "year", alive: false, dod: "1998-04-12", dodp: "exact", nt: "ரங்கசாமி", np: "Thanjavur" }),
    P("gm", "Kamala", "female", { dob: "1930-01-01", dobp: "year", nt: "கமலா" }),
    P("dad", "Ramasamy", "male", { dob: "1950-01-01", dobp: "year", np: "Thanjavur", photo: "f/p/dad.webp" }),
    P("mom", "Lakshmi", "female", { dob: "1955-06-15", dobp: "exact", nt: "லட்சுமி" }),
    P("me", "Karthik Ramasamy", "male", { dob: "1990-05-01", dobp: "exact", nt: "கார்த்திக் ராமசாமி" }),
    P("sis", "Divya", "female", { dob: "1985-01-01", dobp: "exact" }),
  ],
  parents: [["gp", "dad"], ["gm", "dad"], ["dad", "me"], ["mom", "me"], ["dad", "sis"], ["mom", "sis"]].map(([a, b]) => [a, b, "biological"]),
  unions: [["gp", "gm", "1945-01-01", null, null, "year"], ["dad", "mom", "1980-05-10", null, null, "exact"]],
} as never);

describe("text helpers", () => {
  it("wraps without losing a word, keeps paragraphs", () => {
    const lines = wrapLines("one two three four five\n\nsix", 60, 10, measure);
    expect(lines.join(" ").replace(/\s+/g, " ").trim()).toBe("one two three four five six");
    expect(lines).toContain("");
    for (const l of lines) expect(measure(l, 10)).toBeLessThanOrEqual(60);
  });
  it("breaks a word that is wider than the line", () => {
    const lines = wrapLines("x".repeat(100), 50, 10, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("x".repeat(100));
  });
  it("wraps Tamil without cutting a letter in half", () => {
    const ta = "இது ஒரு குடும்ப கதை ".repeat(8);
    const lines = wrapLines(ta, 100, 10, measure);
    expect(lines.join(" ").replace(/\s+/g, " ").trim()).toBe(ta.replace(/\s+/g, " ").trim());
  });
  it("fits a name into a card with an ellipsis", () => {
    const s = fitText("Karthik Ramasamy Subramaniam", 60, 10, measure);
    expect(s.endsWith("…")).toBe(true);
    expect(measure(s, 10)).toBeLessThanOrEqual(60);
    expect(fitText("Ravi", 60, 10, measure)).toBe("Ravi");
  });
});

describe("PDF writer", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const page = (size: keyof typeof PAGE_PT) => ({ ...PAGE_PT[size], jpeg, pxW: 10, pxH: 14 });
  const bytes = buildPdf([page("A4"), page("A3")], "Ramasamy Kudumbam · ராமசாமி");
  const text = new TextDecoder("latin1").decode(bytes);
  it("is a real PDF: header, trailer, end marker", () => {
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Count 2");
  });
  it("has one page object per page with the right paper size", () => {
    expect((text.match(/\/Type \/Page /g) ?? []).length).toBe(2);
    expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(text).toContain("/MediaBox [0 0 841.89 1190.55]");
  });
  it("every cross-reference offset points at its object", () => {
    const start = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const rows = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(rows.length).toBe(3 + 2 * 3);
    rows.forEach((off, i) => expect(text.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });
  it("embeds the JPEG bytes untouched and says how long they are", () => {
    const at = bytes.findIndex((_, i) => bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff && bytes[i + 3] === 0xe0);
    expect(Array.from(bytes.slice(at, at + jpeg.length))).toEqual(Array.from(jpeg));
    expect(text).toContain(`/Length ${jpeg.length} >>`);
  });
  it("stores a Tamil title as UTF-16", () => {
    expect(text).toContain("/Title <FEFF");
    expect(text).toContain("0BB0");
  });
  it("refuses an empty document", () => expect(() => buildPdf([], "x")).toThrow());
});

describe("tree poster", () => {
  const opts = { size: "A4" as const, side: "all" as const, depth: 4, egoId: "me", title: "Ramasamy Kudumbam", generatedOn: "25 Nov 2026" };
  const plan = planPoster(graph, opts, measure)!;
  const texts = (p: typeof plan) => p.page.cmds.filter((c): c is Extract<Cmd, { t: "text" }> => c.t === "text").map((c) => c.s);
  it("puts every person on, with English and Tamil names", () => {
    expect(plan.people).toBe(6);
    const t = texts(plan).join("|");
    for (const n of ["Rangasamy", "Karthik", "Divya"]) expect(t).toContain(n);
    expect(t).toContain("ரங்கசாமி");
    expect(t).toContain("கார்த்திக்");
  });
  it("shows years, death marks, and the title", () => {
    const t = texts(plan);
    expect(t).toContain("1925 – 1998");
    expect(t).toContain("b. 1990");
    expect(t).toContain("Ramasamy Kudumbam");
  });
  it("draws parent lines and marriage lines", () => {
    const lines = plan.page.cmds.filter((c) => c.t === "line");
    expect(lines.length).toBeGreaterThanOrEqual(2 + 3);
    expect(lines.some((l) => l.t === "line" && l.color === "#b45309")).toBe(true);
  });
  it("keeps everything inside the page", () => {
    for (const c of plan.page.cmds) {
      if (c.t === "rect" && c.w > plan.page.w - 10) continue; // background and frame
      if (c.t === "rect" || c.t === "img") {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(plan.page.w);
        expect(c.y + c.h).toBeLessThanOrEqual(plan.page.h);
      }
    }
  });
  it("A3 is bigger than A4", () => {
    const a3 = planPoster(graph, { ...opts, size: "A3" }, measure)!;
    expect(Math.max(a3.page.w, a3.page.h)).toBeGreaterThan(Math.max(plan.page.w, plan.page.h));
    expect(a3.smallestPt).toBeGreaterThanOrEqual(plan.smallestPt);
  });
  it("father's side leaves out mother's side", () => {
    const { ids } = posterPeople(graph, { side: "paternal", depth: 4, egoId: "me" });
    expect(ids.has("dad")).toBe(true);
    expect(ids.has("mom")).toBe(false);
  });
  it("warns when a big tree would print too small, and suggests A3", () => {
    const persons = [P("root", "Root", "male", { dob: "1900-01-01", dobp: "year" })];
    const parents: string[][] = [];
    for (let i = 1; i < 160; i++) { persons.push(P(`n${i}`, `Person ${i}`, "male")); parents.push([i < 8 ? "root" : `n${Math.floor(i / 6)}`, `n${i}`, "biological"]); }
    const big = buildGraph({ persons, parents, unions: [] } as never);
    const p = planPoster(big, { ...opts, egoId: "root", depth: 7 }, measure)!;
    expect(p.tooSmall).toBe(true);
    expect(p.suggestion).toBe("A3");
  });
  it("nothing to print gives nothing", () => expect(planPoster(buildGraph(null), opts, measure)).toBeNull());
  it("reads layout paths", () => expect(pathPoints("M10,20 V5 H40 V7")).toEqual([[10, 20], [10, 5], [40, 5], [40, 7]]));
});

describe("family story book", () => {
  const extras = new Map([
    ["dad", { history: "Ramasamy farmed in Thanjavur for forty years. ".repeat(300), birth_place: "Thanjavur", current_city: "Chennai", native_place: "Thanjavur" }],
    ["gp", { history: "A schoolteacher.", birth_place: null, current_city: null, native_place: null }],
    ["me", { history: "", birth_place: null, current_city: "Chennai", native_place: null }],
  ]);
  const input = buildBookInput(graph, extras, { familyName: "Ramasamy Kudumbam", nativePlace: "Thanjavur", generatedOn: "25 Nov 2026", storiesOnly: true });
  const book = layoutBook(input, measure);
  const allText = book.pages.flatMap((p) => p.cmds.filter((c): c is Extract<Cmd, { t: "text" }> => c.t === "text").map((c) => c.s));
  it("with 'stories only', includes people who have a story or a photo", () => {
    expect(input.people.map((p) => p.id).sort()).toEqual(["dad", "gp"]);
    expect(buildBookInput(graph, extras, { familyName: "x", nativePlace: null, generatedOn: "", storiesOnly: false }).people).toHaveLength(6);
  });
  it("has a cover with the family name and place", () => {
    const cover = book.pages[0].cmds.filter((c) => c.t === "text").map((c) => (c as { s: string }).s).join(" ");
    expect(cover).toContain("Family Story Book");
    expect(cover).toContain("Ramasamy Kudumbam");
    expect(cover).toContain("Thanjavur");
  });
  it("shows name, Tamil name, years, places and family links", () => {
    const t = allText.join("|");
    expect(t).toContain("Rangasamy");
    expect(t).toContain("ரங்கசாமி");
    expect(t).toContain("1925 – 1998");
    expect(t).toContain("Native place: Thanjavur");
    expect(t).toContain("Children: Divya, Karthik Ramasamy");
    expect(t).toContain("Married to: Kamala");
  });
  it("a long story runs onto more pages without losing a line, marked (continued)", () => {
    expect(book.pages.length).toBeGreaterThan(3);
    expect(allText.some((s) => s.includes("(continued)"))).toBe(true);
    const story = allText.filter((s) => s.includes("farmed") || s.includes("forty")).join(" ");
    expect((story.match(/forty years/g) ?? []).length).toBe(300);
  });
  it("places the photo and lists it to be fetched", () => {
    expect(book.photoRefs).toEqual(["f/p/dad.webp"]);
    expect(book.pages.some((p) => p.cmds.some((c) => c.t === "img" && c.ref === "f/p/dad.webp"))).toBe(true);
  });
  it("never draws outside the margins", () => {
    for (const p of book.pages) for (const c of p.cmds) {
      if (c.t === "text") expect(c.y).toBeLessThanOrEqual(p.h - 10);
      if ((c.t === "rect" || c.t === "img") && c.w < p.w - 60) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x + c.w).toBeLessThanOrEqual(p.w - 20); }
    }
  });
  it("ends with a timeline in order, and page numbers", () => {
    const i = allText.indexOf("Timeline");
    expect(i).toBeGreaterThan(0);
    const after = allText.slice(i).join("|");
    expect(after.indexOf("Rangasamy was born")).toBeLessThan(after.indexOf("Rangasamy passed away"));
    expect(allText).toContain("2");
  });
  it("copes with nobody", () => {
    const empty = layoutBook({ familyName: "Empty", nativePlace: null, generatedOn: "", people: [], events: [] }, measure);
    expect(empty.pages.length).toBe(2);
  });
});

describe("long names on the poster", () => {
  it("fits at full size when there is room", async () => {
    const { fitName } = await import("./poster");
    expect(fitName("Karthik Ramasamy", 100, 11, measure, true)).toEqual({ s: "Karthik Ramasamy", size: 11 });
  });
  it("shrinks the font first", async () => {
    const { fitName } = await import("./poster");
    const a = fitName("Karthik Ramasamy", 80, 11, measure, true);
    expect(a.s).toBe("Karthik Ramasamy");
    expect(a.size).toBeCloseTo(9.68, 2);
  });
  it("cuts with an ellipsis only at the smallest size", async () => {
    const { fitName } = await import("./poster");
    const a = fitName("Karthik Ramasamy Subramaniam", 80, 11, measure, true);
    expect(a.s.endsWith("…")).toBe(true);
    expect(a.size).toBeCloseTo(11 * 0.76, 5);
    expect(measure(a.s, a.size, true)).toBeLessThanOrEqual(80);
  });
});
