import type { Graph } from "@/shared/lib/graph";
import { buildTimeline } from "@/shared/lib/timeline";
import { childrenOf, parentsOf, spousesOf } from "@/shared/lib/graph";
import { formatDate } from "@/shared/lib/age";
import { PAGE_PT } from "./pdf";
import { fitText, wrapLines, type Cmd, type Measure, type PageCmds } from "./commands";

// The Family Story Book: a cover, then each person with photo, places and their story, then the timeline.

export interface BookExtras {
  history: string | null;
  birth_place: string | null;
  current_city: string | null;
  native_place: string | null;
}

export interface BookPerson {
  id: string;
  name: string;
  nameNative: string | null;
  years: string;
  places: string;
  bio: string;
  photoRef: string | null;
  family: string;
}

export interface BookInput {
  familyName: string;
  nativePlace: string | null;
  generatedOn: string;
  people: BookPerson[];
  events: { year: number; text: string; date: string }[];
}

const yr = (d: string | null, p: string, alive?: boolean) => (d && p !== "unknown" ? d.slice(0, 4) : alive === false ? "†" : "");

/** Gather what the book needs from the tree and the extra details. */
export function buildBookInput(g: Graph, extras: Map<string, BookExtras>, opts: { familyName: string; nativePlace: string | null; generatedOn: string; storiesOnly: boolean; limit?: number }): BookInput {
  const name = (id: string) => g.persons.get(id)?.name ?? "?";
  const list = [...g.persons.values()]
    .filter((p) => {
      const e = extras.get(p.id);
      return !opts.storiesOnly || !!(e?.history?.trim() || p.photo);
    })
    .sort((a, b) => (a.dob ?? "9999").localeCompare(b.dob ?? "9999") || a.name.localeCompare(b.name))
    .slice(0, opts.limit ?? 120);

  const people: BookPerson[] = list.map((p) => {
    const e = extras.get(p.id);
    const b = yr(p.dob, p.dobp);
    const d = p.alive ? "" : yr(p.dod, p.dodp ?? "unknown", false);
    const parents = parentsOf(g, p.id).map(name);
    const spouses = spousesOf(g, p.id).map((s) => name(s.id));
    const kids = childrenOf(g, p.id).map(name);
    const family = [parents.length ? `Parents: ${parents.join(" & ")}` : "", spouses.length ? `Married to: ${spouses.join(", ")}` : "", kids.length ? `Children: ${kids.join(", ")}` : ""].filter(Boolean).join("\n");
    return {
      id: p.id,
      name: p.name,
      nameNative: p.nt && p.nt !== p.name ? p.nt : null,
      years: b && d ? `${b} – ${d}` : b ? (p.alive ? `born ${b}` : `${b} – †`) : d ? `died ${d}` : "",
      places: [e?.native_place ? `Native place: ${e.native_place}` : p.np ? `Native place: ${p.np}` : "", e?.birth_place ? `Born in ${e.birth_place}` : "", e?.current_city ? `Lives in ${e.current_city}` : ""].filter(Boolean).join(" · "),
      bio: e?.history?.trim() ?? "",
      photoRef: p.photo,
      family,
    };
  });

  const include = new Set(people.map((p) => p.id));
  const events = buildTimeline(g)
    .filter((e) => e.people.some((id) => include.has(id)))
    .map((e) => ({
      year: e.year,
      date: e.date ? formatDate(e.date, "exact") : e.approx ? `around ${e.year}` : String(e.year),
      text: e.kind === "birth" ? `${name(e.people[0])} was born` : e.kind === "death" ? `${name(e.people[0])} passed away` : `${name(e.people[0])} and ${name(e.people[1])} were married`,
    }));
  return { familyName: opts.familyName, nativePlace: opts.nativePlace, generatedOn: opts.generatedOn, people, events };
}

const M = 50; // page margin
const BODY = 11;
const LEAD = 16;
const PHOTO_W = 84;
const PHOTO_H = 104;

/** Work out every page of the book. */
export function layoutBook(input: BookInput, measure: Measure): { pages: PageCmds[]; photoRefs: string[] } {
  const { w: W, h: H } = PAGE_PT.A4;
  const pages: PageCmds[] = [];
  const photoRefs: string[] = [];
  let cmds: Cmd[] = [];
  let y = M;
  const textW = W - 2 * M;

  const newPage = () => {
    cmds = [{ t: "rect", x: 0, y: 0, w: W, h: H, fill: "#fffdf8" }];
    pages.push({ w: W, h: H, cmds });
    y = M;
  };
  const footer = () => pages.forEach((p, i) => i > 0 && p.cmds.push({ t: "text", x: W / 2, y: H - 24, s: `${i + 1}`, size: 9, color: "#78716c", align: "center" }));

  // ----- cover -----
  newPage();
  cmds.push({ t: "rect", x: 28, y: 28, w: W - 56, h: H - 56, stroke: "#b45309", lw: 2, r: 10 });
  cmds.push({ t: "text", x: W / 2, y: 250, s: "Family Story Book", size: 18, color: "#57534e", align: "center" });
  const titleLines = wrapLines(input.familyName, textW - 60, 34, measure, true);
  titleLines.forEach((l, i) => cmds.push({ t: "text", x: W / 2, y: 310 + i * 42, s: l, size: 34, bold: true, color: "#b45309", align: "center" }));
  const subY = 330 + titleLines.length * 42;
  if (input.nativePlace) cmds.push({ t: "text", x: W / 2, y: subY, s: input.nativePlace, size: 16, color: "#44403c", align: "center" });
  cmds.push({ t: "text", x: W / 2, y: subY + 40, s: `${input.people.length} family members`, size: 13, color: "#57534e", align: "center" });
  cmds.push({ t: "text", x: W / 2, y: H - 90, s: `Made with Nammoor · நம்மூர் · ${input.generatedOn}`, size: 10, color: "#78716c", align: "center" });

  // ----- people -----
  newPage();
  cmds.push({ t: "text", x: M, y: y + 18, s: "Our people", size: 22, bold: true, color: "#b45309" });
  y += 40;

  for (const p of input.people) {
    const bioLines = p.bio ? wrapLines(p.bio, textW, BODY, measure) : [];
    const famLines = p.family ? p.family.split("\n").flatMap((l) => wrapLines(l, textW, BODY - 1, measure)) : [];
    const headH = Math.max(p.photoRef ? PHOTO_H : 0, 54 + (p.places ? LEAD : 0));
    const minBlock = headH + 14 + Math.min(bioLines.length, 3) * LEAD;
    if (y + minBlock > H - M) newPage();

    const header = (cont: boolean) => {
      const photo = p.photoRef && !cont;
      const tx = photo ? M + PHOTO_W + 16 : M;
      if (photo) {
        cmds.push({ t: "img", x: M, y, w: PHOTO_W, h: PHOTO_H, ref: p.photoRef! });
        cmds.push({ t: "rect", x: M, y, w: PHOTO_W, h: PHOTO_H, stroke: "#d6d3d1", lw: 0.8 });
        if (!photoRefs.includes(p.photoRef!)) photoRefs.push(p.photoRef!);
      }
      cmds.push({ t: "text", x: tx, y: y + 18, s: fitText(p.name + (cont ? " (continued)" : ""), W - M - tx, 17, measure, true), size: 17, bold: true, color: "#1c1917" });
      let ty = y + 18;
      if (p.nameNative && !cont) { ty += 20; cmds.push({ t: "text", x: tx, y: ty, s: fitText(p.nameNative, W - M - tx, 14, measure), size: 14, color: "#0c4a6e" }); }
      if (p.years && !cont) { ty += 18; cmds.push({ t: "text", x: tx, y: ty, s: p.years, size: 12, color: "#57534e" }); }
      if (p.places && !cont) {
        for (const l of wrapLines(p.places, W - M - tx, 10, measure).slice(0, 2)) { ty += 15; cmds.push({ t: "text", x: tx, y: ty, s: l, size: 10, color: "#57534e" }); }
      }
      y += cont ? 30 : Math.max(photo ? PHOTO_H : 0, ty - y + 6) + 10;
    };

    header(false);
    let i = 0;
    while (i < bioLines.length) {
      if (y + LEAD > H - M) {
        newPage();
        header(true);
      }
      cmds.push({ t: "text", x: M, y: y + 12, s: bioLines[i], size: BODY, color: "#292524" });
      y += LEAD;
      i++;
    }
    if (famLines.length) {
      y += 4;
      for (const l of famLines) {
        if (y + LEAD > H - M) {
          newPage();
          header(true);
        }
        cmds.push({ t: "text", x: M, y: y + 11, s: l, size: BODY - 1, color: "#57534e" });
        y += LEAD - 2;
      }
    }
    cmds.push({ t: "line", x1: M, y1: y + 8, x2: W - M, y2: y + 8, color: "#e7e5e4", lw: 0.8 });
    y += 22;
  }

  // ----- timeline -----
  if (input.events.length) {
    newPage();
    cmds.push({ t: "text", x: M, y: y + 18, s: "Timeline", size: 22, bold: true, color: "#b45309" });
    y += 44;
    let last = 0;
    for (const e of input.events) {
      const lines = wrapLines(e.text, textW - 90, BODY, measure);
      if (y + lines.length * LEAD + (e.year !== last ? 26 : 0) > H - M) {
        newPage();
        last = 0;
      }
      if (e.year !== last) {
        y += 8;
        cmds.push({ t: "text", x: M, y: y + 14, s: String(e.year), size: 14, bold: true, color: "#b45309" });
        y += 22;
        last = e.year;
      }
      cmds.push({ t: "text", x: M + 8, y: y + 11, s: e.date, size: 9.5, color: "#78716c" });
      lines.forEach((l, k) => cmds.push({ t: "text", x: M + 90, y: y + 11 + k * LEAD, s: l, size: BODY, color: "#292524" }));
      y += lines.length * LEAD + 2;
    }
  }
  footer();
  return { pages, photoRefs };
}
