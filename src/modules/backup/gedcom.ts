import { cleanPerson, kind as cleanKind, precision as cleanPrecision, text } from "./clean";
import { ImportError } from "./json";
import { MAX_PEOPLE, type BackupData, type ImportData, type ImportPerson, type ImportUnion, type ParentKind, type Precision } from "./types";

// GEDCOM 5.5.1, UTF-8. The standard way to move a family tree between programs.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// ================= writing =================

export function gedcomDate(date: string | null, p: Precision): string | null {
  if (!date || p === "unknown") return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y) return null;
  const month = MONTHS[(m || 1) - 1];
  if (p === "year") return String(y);
  if (p === "month") return `${month} ${y}`;
  if (p === "approx") return `ABT ${y}`;
  return `${d} ${month} ${y}`;
}

/** One GEDCOM line, split to the 255 character limit with CONC, newlines with CONT. */
function lines(level: number, tag: string, value: string | null | undefined, out: string[]) {
  if (value === null || value === undefined || value === "") {
    out.push(`${level} ${tag}`);
    return;
  }
  const safe = value.replace(/\r\n?/g, "\n").replace(/@/g, "@@");
  const parts = safe.split("\n");
  parts.forEach((part, i) => {
    const chars = [...part]; // by letter, so a Tamil letter or emoji is never cut in half
    const first = i === 0 ? `${level} ${tag} ` : `${level + 1} CONT `;
    const room = 240;
    let chunk = chars.splice(0, room).join("");
    out.push(first + chunk);
    while (chars.length) {
      chunk = chars.splice(0, room).join("");
      out.push(`${level + 1} CONC ${chunk}`);
    }
  });
}

const gedName = (name: string) => `${name.replace(/\//g, "")} //`;

export function toGedcom(b: BackupData, fileName = "nammoor.ged", today: Date = new Date()): string {
  const out: string[] = [];
  const xi = new Map<string, string>();
  b.persons.forEach((p, i) => xi.set(p.id, `@I${i + 1}@`));

  out.push("0 HEAD", "1 SOUR NAMMOOR", "2 NAME Nammoor", "2 VERS 1.0", "1 DEST ANY");
  out.push(`1 DATE ${today.getDate()} ${MONTHS[today.getMonth()]} ${today.getFullYear()}`);
  out.push("1 CHAR UTF-8", "1 GEDC", "2 VERS 5.5.1", "2 FORM LINEAGE-LINKED");
  lines(1, "FILE", fileName, out);
  out.push("1 SUBM @SUBM@", "0 @SUBM@ SUBM", "1 NAME Nammoor");

  // ----- families: one per couple, plus one per set of parents a child has -----
  interface Fam { id: string; husb: string | null; wife: string | null; kids: { id: string; pedi: ParentKind }[]; marr?: BackupData["unions"][number] }
  const fams = new Map<string, Fam>();
  const gender = new Map(b.persons.map((p) => [p.id, p.gender]));
  let n = 0;
  const famFor = (a: string, c: string | null): Fam => {
    // the father (or the man) is HUSB; if gender is unknown the first person is
    let husb: string | null = a;
    let wife: string | null = c;
    if (c && (gender.get(a) === "female" || (gender.get(c) === "male" && gender.get(a) !== "male"))) [husb, wife] = [c, a];
    if (!c && gender.get(a) === "female") [husb, wife] = [null, a];
    const key = [husb ?? "", wife ?? ""].join("|");
    let f = fams.get(key);
    if (!f) {
      f = { id: `@F${++n}@`, husb, wife, kids: [] };
      fams.set(key, f);
    }
    return f;
  };
  for (const u of b.unions) famFor(u.partner_a, u.partner_b).marr = u;

  const parentsOf = new Map<string, { id: string; kind: ParentKind }[]>();
  for (const l of b.parent_child) parentsOf.set(l.child_id, [...(parentsOf.get(l.child_id) ?? []), { id: l.parent_id, kind: l.kind }]);
  for (const [child, ps] of parentsOf) {
    for (const k of ["biological", "adopted", "foster", "step"] as ParentKind[]) {
      const group = ps.filter((p) => p.kind === k).slice(0, 2);
      if (!group.length) continue;
      famFor(group[0].id, group[1]?.id ?? null).kids.push({ id: child, pedi: k });
    }
  }
  const famsOf = new Map<string, Fam[]>(); // as partner
  const famcOf = new Map<string, { fam: Fam; pedi: ParentKind }[]>(); // as child
  for (const f of fams.values()) {
    for (const id of [f.husb, f.wife]) if (id) famsOf.set(id, [...(famsOf.get(id) ?? []), f]);
    for (const k of f.kids) famcOf.set(k.id, [...(famcOf.get(k.id) ?? []), { fam: f, pedi: k.pedi }]);
  }

  const occ = new Map<string, BackupData["occupations"]>();
  const edu = new Map<string, BackupData["education"]>();
  for (const o of b.occupations) occ.set(o.person_id, [...(occ.get(o.person_id) ?? []), o]);
  for (const e of b.education) edu.set(e.person_id, [...(edu.get(e.person_id) ?? []), e]);

  for (const p of b.persons) {
    out.push(`0 ${xi.get(p.id)} INDI`);
    lines(1, "NAME", gedName(p.full_name), out);
    if (p.nickname) lines(2, "NICK", p.nickname, out);
    if (p.name_native) {
      lines(1, "NAME", gedName(p.name_native), out);
      out.push("2 TYPE aka");
    }
    out.push(`1 SEX ${p.gender === "male" ? "M" : p.gender === "female" ? "F" : p.gender === "other" ? "X" : "U"}`);
    const bd = gedcomDate(p.birth_date, p.birth_precision);
    if (bd || p.birth_place) {
      out.push("1 BIRT");
      if (bd) out.push(`2 DATE ${bd}`);
      if (p.birth_place) lines(2, "PLAC", p.birth_place, out);
    }
    if (!p.is_living) {
      const dd = gedcomDate(p.death_date, p.death_precision);
      if (dd) out.push("1 DEAT", `2 DATE ${dd}`);
      else out.push("1 DEAT Y");
    }
    if (p.current_city) {
      out.push("1 RESI");
      lines(2, "PLAC", p.current_city, out);
    }
    for (const o of occ.get(p.id) ?? []) {
      lines(1, "OCCU", o.title, out);
      if (o.organization) lines(2, "AGNC", o.organization, out);
    }
    for (const e of edu.get(p.id) ?? []) {
      const label = [e.course, e.institution].filter(Boolean).join(", ");
      if (label) lines(1, "EDUC", label, out);
    }
    if (p.native_place) lines(1, "_NATIVE", p.native_place, out);
    if (p.birth_order) lines(1, "_ORDER", String(p.birth_order), out);
    if (p.history) lines(1, "NOTE", p.history, out);
    for (const f of famsOf.get(p.id) ?? []) out.push(`1 FAMS ${f.id}`);
    for (const c of famcOf.get(p.id) ?? []) {
      out.push(`1 FAMC ${c.fam.id}`);
      if (c.pedi === "adopted" || c.pedi === "foster") out.push(`2 PEDI ${c.pedi}`);
    }
  }
  for (const f of fams.values()) {
    out.push(`0 ${f.id} FAM`);
    if (f.husb) out.push(`1 HUSB ${xi.get(f.husb)}`);
    if (f.wife) out.push(`1 WIFE ${xi.get(f.wife)}`);
    for (const k of f.kids) out.push(`1 CHIL ${xi.get(k.id)}`);
    const m = f.marr;
    if (m) {
      const md = gedcomDate(m.married_on, m.married_precision);
      if (md || !m.ended_on) {
        out.push("1 MARR");
        if (md) out.push(`2 DATE ${md}`);
      }
      if (m.ended_on && m.end_reason !== "death") {
        out.push("1 DIV");
        const ed = gedcomDate(m.ended_on, "exact");
        if (ed) out.push(`2 DATE ${ed}`);
      }
    }
  }
  out.push("0 TRLR");
  return out.join("\r\n") + "\r\n";
}

// ================= reading =================

interface Node {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
  kids: Node[];
}

/** Level, tag, value lines -> a tree. CONC and CONT are joined here. */
function parseLines(src: string): Node[] {
  const roots: Node[] = [];
  const stack: Node[] = [];
  for (const raw of src.replace(/^﻿/, "").split(/\r\n|\n|\r/)) {
    const line = raw.replace(/^\s+/, "");
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/);
    if (!m) continue; // a stray line is not worth failing for
    const level = Number(m[1]);
    const tag = m[3].toUpperCase();
    const value = (m[4] ?? "").replace(/@@/g, "@");
    if ((tag === "CONC" || tag === "CONT") && level >= 1 && stack[level - 1]) {
      // a continuation belongs to the line one level above it
      stack[level - 1].value += (tag === "CONT" ? "\n" : "") + value;
      continue;
    }
    const node: Node = { level, xref: m[2] ?? null, tag, value, kids: [] };
    stack.length = Math.min(level, stack.length);
    if (level === 0) roots.push(node);
    else stack[level - 1]?.kids.push(node);
    stack[level] = node;
  }
  return roots;
}

const child = (n: Node, tag: string) => n.kids.find((k) => k.tag === tag);
const kidsOf = (n: Node, tag: string) => n.kids.filter((k) => k.tag === tag);

/** "24 MAR 1992", "MAR 1992", "1992", "ABT 1950", "BET 1950 AND 1955". Anything else: unknown. */
export function parseGedcomDate(v: string | undefined): { date: string | null; precision: Precision; understood: boolean } {
  const none = { date: null, precision: "unknown" as Precision };
  if (!v || !v.trim()) return { ...none, understood: true };
  let s = v.trim().toUpperCase().replace(/\s+/g, " ");
  let approx = false;
  const prefix = s.match(/^(ABT|ABOUT|CAL|EST|BEF|AFT|BET|FROM)\b\s*/);
  if (prefix) {
    approx = true;
    s = s.slice(prefix[0].length);
    if (prefix[1] === "BET" || prefix[1] === "FROM") s = s.split(/\s+(?:AND|TO)\s+/)[0];
  }
  s = s.replace(/^(\d{4})\/\d{1,2}$/, "$1"); // dual dating 1750/51
  const full = s.match(/^(\d{1,2}) ([A-Z]{3}) (\d{4})$/);
  const mon = s.match(/^([A-Z]{3}) (\d{4})$/);
  const yr = s.match(/^(\d{4})$/);
  let y: number, mo = 1, d = 1;
  let p: Precision;
  if (full) {
    [d, mo, y] = [Number(full[1]), MONTHS.indexOf(full[2]) + 1, Number(full[3])];
    p = "exact";
  } else if (mon) {
    [mo, y] = [MONTHS.indexOf(mon[1]) + 1, Number(mon[2])];
    p = "month";
  } else if (yr) {
    y = Number(yr[1]);
    p = "year";
  } else return { ...none, understood: false };
  if (mo < 1 || y < 1000 || y > 2100 || d < 1 || d > new Date(y, mo, 0).getDate()) return { ...none, understood: false };
  const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { date, precision: approx ? "approx" : p, understood: true };
}

const stripSlashes = (n: string) => n.replace(/\//g, " ").replace(/\s+/g, " ").trim();

export function parseGedcom(src: string): ImportData {
  const roots = parseLines(src);
  if (!roots.some((r) => r.tag === "HEAD") && !roots.some((r) => r.tag === "INDI")) throw new ImportError("This is not a GEDCOM file.");
  const warnings: string[] = [];
  const warn = (m: string) => warnings.length < 50 && warnings.push(m);
  const head = roots.find((r) => r.tag === "HEAD");
  const charset = child(head ?? roots[0], "CHAR")?.value.toUpperCase();
  if (charset && !/UTF-?8|UNICODE/.test(charset)) warn(`This file uses the "${charset}" character set. Names with special letters may look wrong. Re-export it as UTF-8 if you can.`);

  const indis = roots.filter((r) => r.tag === "INDI" && r.xref);
  if (indis.length > MAX_PEOPLE) throw new ImportError(`This file has ${indis.length} people. The limit is ${MAX_PEOPLE} per import.`);
  if (!indis.length) throw new ImportError("This GEDCOM file has no people in it.");

  const persons: ImportPerson[] = [];
  const pediOf = new Map<string, ParentKind>(); // "childRef|famRef" -> how they are a child
  for (const n of indis) {
    const ref = n.xref!;
    const nameNodes = kidsOf(n, "NAME");
    const given = child(nameNodes[0] ?? n, "GIVN")?.value;
    const sur = child(nameNodes[0] ?? n, "SURN")?.value;
    const name = stripSlashes(nameNodes[0]?.value ?? "") || [given, sur].filter(Boolean).join(" ") || "Unknown";
    const aka = nameNodes.slice(1).map((x) => stripSlashes(x.value)).find(Boolean) ?? null;
    const sex = child(n, "SEX")?.value.trim().toUpperCase();
    const birt = child(n, "BIRT");
    const bdRaw = birt ? child(birt, "DATE")?.value : undefined;
    const bd = parseGedcomDate(bdRaw);
    if (!bd.understood) warn(`${name}: birth date "${bdRaw?.slice(0, 25)}" was not understood and was left empty.`);
    const deat = child(n, "DEAT");
    const dd = parseGedcomDate(deat ? child(deat, "DATE")?.value : undefined);
    if (deat && !dd.understood) warn(`${name}: death date "${child(deat, "DATE")?.value.slice(0, 25)}" was not understood and was left empty.`);
    const resi = child(n, "RESI");
    const notes = kidsOf(n, "NOTE").map((x) => x.value).filter((v) => v && !/^@.+@$/.test(v)).join("\n\n");
    const order = Number(child(n, "_ORDER")?.value);

    persons.push(cleanPerson({
      full_name: name,
      nickname: child(nameNodes[0] ?? n, "NICK")?.value,
      name_native: aka,
      gender: sex === "M" ? "male" : sex === "F" ? "female" : sex === "X" ? "other" : "unknown",
      birth_date: bd.date, birth_precision: bd.precision,
      birth_place: birt ? child(birt, "PLAC")?.value : null,
      is_living: !deat,
      death_date: dd.date, death_precision: dd.precision,
      current_city: resi ? child(resi, "PLAC")?.value : null,
      native_place: child(n, "_NATIVE")?.value,
      birth_order: Number.isFinite(order) ? order : null,
      history: notes,
      occupations: kidsOf(n, "OCCU").map((o) => ({ title: o.value, organization: child(o, "AGNC")?.value ?? null })),
      education: kidsOf(n, "EDUC").map((e) => ({ level: "other", course: e.value })),
    }, ref, warn));
    for (const c of kidsOf(n, "FAMC")) {
      const p = child(c, "PEDI")?.value.trim().toLowerCase();
      pediOf.set(`${ref}|${c.value.trim()}`, p === "adopted" ? "adopted" : p === "foster" ? "foster" : "biological");
    }
  }

  const known = new Set(persons.map((p) => p.ref));
  const parents: [string, string, ParentKind][] = [];
  const unions: ImportUnion[] = [];
  const seenLink = new Set<string>();
  let skipped = 0;
  for (const f of roots.filter((r) => r.tag === "FAM" && r.xref)) {
    const husb = child(f, "HUSB")?.value.trim() ?? null;
    const wife = child(f, "WIFE")?.value.trim() ?? null;
    const ps = [husb, wife].filter((x): x is string => !!x && known.has(x));
    if ([husb, wife].some((x) => x && !known.has(x))) skipped++;
    for (const c of kidsOf(f, "CHIL")) {
      const cr = c.value.trim();
      if (!known.has(cr)) { skipped++; continue; }
      for (const pr of ps) {
        const key = `${pr}|${cr}`;
        if (pr === cr || seenLink.has(key)) continue;
        seenLink.add(key);
        parents.push([pr, cr, cleanKind(pediOf.get(`${cr}|${f.xref}`) ?? "biological")]);
      }
    }
    if (husb && wife && known.has(husb) && known.has(wife) && husb !== wife) {
      const marr = child(f, "MARR");
      const md = parseGedcomDate(marr ? child(marr, "DATE")?.value : undefined);
      if (marr && !md.understood) warn(`A marriage date "${child(marr, "DATE")?.value.slice(0, 25)}" was not understood and was left empty.`);
      const div = child(f, "DIV");
      const ed = parseGedcomDate(div ? child(div, "DATE")?.value : undefined);
      if (div && !ed.date) warn("A divorce without a date was imported as a marriage that has not ended.");
      unions.push({
        a: husb, b: wife, married_on: md.date, married_precision: cleanPrecision(md.precision, md.date),
        ended_on: ed.date, end_reason: ed.date ? "divorce" : null,
      });
    }
  }
  if (skipped) warn(`${skipped} family link${skipped === 1 ? "" : "s"} pointed to people who are not in the file and were skipped.`);
  return { source: "gedcom", familyName: text(child(head ?? roots[0], "FILE")?.value, 120)?.replace(/\.(ged|gedcom)$/i, "") ?? null, persons, parents, unions, warnings };
}
