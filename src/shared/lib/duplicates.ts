import type { Enums } from "./supabase";
import type { GPerson, Graph } from "./graph";

// "Is the person you are adding already in your tree?"
// Only ever looks at the graph of the family you are in, so nothing from another family can show up.

export interface Candidate {
  name: string;
  birthYear: number | null;
  nativePlace?: string | null;
  gender?: Enums<"gender_t">;
}

export interface DupMatch {
  id: string;
  score: number;
  confidence: "high" | "possible";
  /** Plain words for the banner: "same name", "born within 2 years", "same native place". */
  reasons: string[];
}

export const YEAR_WINDOW = 3;

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
/** Name parts, without one-letter initials ("S. Ramasamy" -> ["ramasamy"]). */
const tokens = (s: string) => norm(s).split(" ").filter((t) => [...t].length > 1);
const key = (s: string) => tokens(s).join("");

function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const A = [...a];
  const B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, i) => i);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > limit) return limit + 1;
    prev = cur;
  }
  return prev[B.length];
}

type NameMatch = "exact" | "contained" | "similar" | null;

export function compareNames(a: string, b: string): NameMatch {
  const ka = key(a);
  const kb = key(b);
  if (!ka || !kb) return null;
  if (ka === kb) return "exact";
  const ta = tokens(a);
  const tb = tokens(b);
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // "Ramasamy" inside "Ramasamy Kumar": every part of the shorter name is in the longer one
  if (small.length && small.every((t) => big.includes(t)) && small.some((t) => [...t].length >= 4)) return "contained";
  const limit = ka.length >= 10 && kb.length >= 10 ? 2 : ka.length >= 6 && kb.length >= 6 ? 1 : 0;
  return limit && distance(ka, kb, limit) <= limit ? "similar" : null; // Ramasamy / Ramasami
}

const place = (s: string | null | undefined) => norm(s ?? "");

export function compare(c: Candidate, p: GPerson): DupMatch | null {
  const nm = compareNames(c.name, p.name);
  if (!nm) return null;
  if (c.gender && c.gender !== "unknown" && p.g !== "unknown" && c.gender !== p.g) return null;

  const reasons = [nm === "exact" ? "same name" : nm === "contained" ? "name matches" : "very similar name"];
  let score = nm === "exact" ? 3 : 2;

  let yearOk = false;
  const py = p.dob && p.dobp !== "unknown" ? Number(p.dob.slice(0, 4)) : null;
  if (c.birthYear !== null && py !== null) {
    const diff = Math.abs(c.birthYear - py);
    if (diff > YEAR_WINDOW) return null; // clearly a different person
    yearOk = true;
    score += diff <= 1 ? 2 : 1;
    reasons.push(diff === 0 ? "born the same year" : `born ${diff} year${diff === 1 ? "" : "s"} apart`);
  }

  const a = place(c.nativePlace);
  const b = place(p.np);
  let placeConflict = false;
  if (a && b) {
    if (a === b) {
      score += 1;
      reasons.push("same native place");
    } else {
      score -= 1;
      placeConflict = true;
    }
  }

  const strong = (nm === "exact" || nm === "contained") && ((yearOk && !placeConflict) || (a !== "" && a === b));
  return { id: p.id, score, confidence: strong ? "high" : "possible", reasons };
}

/** Likely duplicates inside this family only, best first. */
export function findLikelyDuplicates(g: Graph, c: Candidate, opts: { exclude?: Iterable<string>; max?: number } = {}): DupMatch[] {
  if (!norm(c.name)) return [];
  const skip = new Set(opts.exclude ?? []);
  const out: DupMatch[] = [];
  for (const p of g.persons.values()) {
    if (skip.has(p.id)) continue;
    const m = compare(c, p);
    if (m) out.push(m);
  }
  return out.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id)).slice(0, opts.max ?? 3);
}

/** Parents, children, partners and brothers and sisters. A son with his father's name is not a duplicate. */
export function closeRelatives(g: Graph, id: string): Set<string> {
  const out = new Set<string>([id]);
  const parents = g.parentsOf.get(id) ?? [];
  for (const p of parents) {
    out.add(p.id);
    for (const sib of g.childrenOf.get(p.id) ?? []) out.add(sib);
  }
  for (const c of g.childrenOf.get(id) ?? []) out.add(c);
  for (const u of g.unionsOf.get(id) ?? []) out.add(u.a === id ? u.b : u.a);
  return out;
}

export function candidateFrom(p: GPerson): Candidate {
  return { name: p.name, birthYear: p.dob && p.dobp !== "unknown" ? Number(p.dob.slice(0, 4)) : null, nativePlace: p.np, gender: p.g };
}
