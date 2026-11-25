import { generations, type GPerson, type Graph } from "@/shared/lib/graph";
import { computeRelations } from "@/modules/relations/engine";
import { CARD, layoutTree } from "@/modules/family-tree/layout";
import { PAGE_PT, type PaperSize } from "./pdf";
import { fitText, type Cmd, type Measure, type PageCmds } from "./commands";

/** A long name gets a smaller font first (down to 76%), and only then an ellipsis. */
export function fitName(text: string, room: number, size: number, measure: Measure, bold = false): { s: string; size: number } {
  for (const k of [1, 0.88, 0.76]) if (measure(text, size * k, bold) <= room) return { s: text, size: size * k };
  return { s: fitText(text, room, size * 0.76, measure, bold), size: size * 0.76 };
}
const SHRINK = 0.76;

export interface PosterOptions {
  size: PaperSize;
  side: "all" | "paternal" | "maternal";
  /** Generations shown above and below the person (same idea as the slider). */
  depth: number;
  egoId: string | null;
  title: string;
  generatedOn: string;
}

export interface PosterPlan {
  page: PageCmds;
  people: number;
  /** Size of the smallest text on the printed page, in points. */
  smallestPt: number;
  /** Too small to read comfortably when printed. Suggest a bigger paper or fewer people. */
  tooSmall: boolean;
  suggestion: PaperSize | null;
  landscape: boolean;
}

const MARGIN = 30;
const HEADER = 58;
const FOOTER = 26;
const MIN_READABLE_PT = 6;

const years = (p: GPerson) => {
  const b = p.dob && p.dobp !== "unknown" ? p.dob.slice(0, 4) : "";
  const d = !p.alive ? (p.dod && p.dodp !== "unknown" ? p.dod.slice(0, 4) : "†") : "";
  if (b && d) return `${b} – ${d}`;
  if (b) return p.alive ? `b. ${b}` : `${b} – †`;
  return d ? `d. ${d}` : "";
};

/** Which people go on the poster. */
export function posterPeople(g: Graph, o: Pick<PosterOptions, "side" | "depth" | "egoId">): { ids: Set<string>; levels: Map<string, number> } {
  const ego = o.egoId && g.persons.has(o.egoId) ? o.egoId : [...g.persons.values()].sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null;
  const levels = generations(g, ego);
  const rels = ego ? computeRelations(g, ego) : new Map();
  const ids = new Set<string>();
  for (const p of g.persons.values()) {
    if (o.side !== "all" && p.id !== ego && rels.get(p.id)?.side !== o.side) continue;
    if (Math.abs(levels.get(p.id) ?? 0) > o.depth - 1) continue;
    ids.add(p.id);
  }
  return { ids, levels };
}

/** "M10,20 V30 H40 V50" -> points */
export function pathPoints(d: string): [number, number][] {
  const pts: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const t of d.match(/[MVH]\s*-?[\d.]+(?:,-?[\d.]+)?/g) ?? []) {
    const k = t[0];
    const n = t.slice(1).trim().split(",").map(Number);
    if (k === "M") [x, y] = [n[0], n[1]];
    else if (k === "V") y = n[0];
    else x = n[0];
    pts.push([x, y]);
  }
  return pts;
}

export function planPoster(g: Graph, o: PosterOptions, measure: Measure): PosterPlan | null {
  const { ids, levels } = posterPeople(g, o);
  if (!ids.size) return null;
  const layout = layoutTree(g, ids, levels);

  // landscape for wide trees
  const landscape = layout.width > layout.height * 1.15;
  const paper = PAGE_PT[o.size];
  const pw = landscape ? paper.h : paper.w;
  const ph = landscape ? paper.w : paper.h;
  const areaW = pw - MARGIN * 2;
  const areaH = ph - MARGIN * 2 - HEADER - FOOTER;
  const scale = Math.min(areaW / layout.width, areaH / layout.height, 1.6);
  const offX = MARGIN + (areaW - layout.width * scale) / 2;
  const offY = MARGIN + HEADER + (areaH - layout.height * scale) / 2;
  const X = (x: number) => offX + x * scale;
  const Y = (y: number) => offY + y * scale;

  const cmds: Cmd[] = [{ t: "rect", x: 0, y: 0, w: pw, h: ph, fill: "#fffdf8" }];
  cmds.push({ t: "rect", x: MARGIN - 10, y: MARGIN - 10, w: pw - 2 * (MARGIN - 10), h: ph - 2 * (MARGIN - 10), stroke: "#b45309", lw: 1.2, r: 8 });
  cmds.push({ t: "text", x: pw / 2, y: MARGIN + 24, s: o.title, size: 22, bold: true, color: "#b45309", align: "center" });
  cmds.push({ t: "text", x: pw / 2, y: MARGIN + 44, s: `${ids.size} people · ${o.generatedOn}`, size: 10, color: "#57534e", align: "center" });

  // parent -> child lines, partners
  for (const d of layout.links) {
    const pts = pathPoints(d);
    for (let i = 1; i < pts.length; i++) cmds.push({ t: "line", x1: X(pts[i - 1][0]), y1: Y(pts[i - 1][1]), x2: X(pts[i][0]), y2: Y(pts[i][1]), color: "#a8a29e", lw: Math.max(0.6, 1.4 * scale) });
  }
  for (const c of layout.couples) cmds.push({ t: "line", x1: X(c.x1), y1: Y(c.y), x2: X(c.x2), y2: Y(c.y), color: "#b45309", lw: Math.max(1, 3 * scale) });

  const nameSize = 11 * scale;
  const subSize = 10 * scale;
  const yrSize = 9 * scale;
  const padX = 7 * scale;
  for (const b of layout.boxes.values()) {
    const p = g.persons.get(b.id)!;
    const x = X(b.x);
    const y = Y(b.y);
    const w = CARD.w * scale;
    const h = CARD.h * scale;
    const stripe = p.g === "male" ? "#0369a1" : p.g === "female" ? "#be185d" : "#78716c";
    cmds.push({ t: "rect", x, y, w, h, fill: "#ffffff", stroke: "#d6d3d1", lw: 0.8, r: 5 * scale });
    cmds.push({ t: "rect", x, y, w: 4 * scale, h, fill: stripe, r: 2 * scale });
    const room = w - padX - 4 * scale - 3 * scale;
    const cx = x + 4 * scale + padX;
    const en = fitName(p.name, room - (p.alive ? 0 : 10 * scale), nameSize, measure, true);
    cmds.push({ t: "text", x: cx, y: y + 17 * scale, s: en.s, size: en.size, bold: true, color: "#1c1917" });
    if (p.nt && p.nt !== p.name) {
      const ta = fitName(p.nt, room, subSize, measure);
      cmds.push({ t: "text", x: cx, y: y + 32 * scale, s: ta.s, size: ta.size, color: "#0c4a6e" });
    }
    const yr = years(p);
    if (yr) cmds.push({ t: "text", x: cx, y: y + 48 * scale, s: yr, size: yrSize, color: "#57534e" });
    if (!p.alive) cmds.push({ t: "text", x: x + w - 6 * scale, y: y + 17 * scale, s: "†", size: nameSize, color: "#57534e", align: "right" });
  }

  cmds.push({ t: "text", x: MARGIN, y: ph - MARGIN - 4, s: "━ married     ┃ parent to child", size: 8, color: "#78716c" });
  cmds.push({ t: "text", x: pw - MARGIN, y: ph - MARGIN - 4, s: "Made with Nammoor · நம்மூர்", size: 8, color: "#78716c", align: "right" });

  const smallestPt = Math.min(yrSize, nameSize * SHRINK, subSize * SHRINK);
  const tooSmall = smallestPt < MIN_READABLE_PT;
  return {
    page: { w: pw, h: ph, cmds },
    people: ids.size,
    smallestPt,
    tooSmall,
    suggestion: tooSmall && o.size === "A4" ? "A3" : null,
    landscape,
  };
}
