import { childrenOf, parentsOf, spousesOf, type GPerson, type Graph } from "@/shared/lib/graph";
import { DISTANT, GREAT, SELF, TERMS, type Term } from "./terms";

// Atoms: what one step of the family path means, read from the viewer outward.
export type Atom =
  | "F" | "M" | "P" // father, mother, parent of unknown gender
  | "S" | "D" | "C" // son, daughter, child of unknown gender
  | "H" | "W" | "X" // husband, wife, spouse of unknown gender
  | "eB" | "yB" | "B" | "eZ" | "yZ" | "Z" | "G"; // siblings: elder/younger/unknown age; G = unknown gender

export type Side = "self" | "own" | "paternal" | "maternal" | "inlaw" | "other";

export interface Relation {
  chain: Atom[];
  term: Term | null;
  /** Plain English: "Father's elder brother's wife". Always correct, never needs data. */
  desc: string;
  side: Side;
  cousin: boolean;
}

type Edge = "up" | "down" | "spouse";

const UP = 10;
const DOWN = 10;
const SPOUSE = 11; // slightly dearer, so blood paths win ties over marriage paths

// ---------- shortest family path from one person to everyone ----------

function neighbours(g: Graph, id: string): [string, Edge][] {
  const out: [string, Edge][] = [];
  for (const p of parentsOf(g, id)) out.push([p, "up"]);
  for (const c of childrenOf(g, id)) out.push([c, "down"]);
  for (const s of spousesOf(g, id)) {
    // Ended marriages (divorce, separation) no longer create in-laws.
    if (s.union.reason === "divorce" || s.union.reason === "separation") continue;
    out.push([s.id, "spouse"]);
  }
  return out;
}

interface Prev {
  from: string;
  edge: Edge;
}

function shortestPaths(g: Graph, start: string): Map<string, Prev | null> {
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, Prev | null>([[start, null]]);
  const done = new Set<string>();
  // tiny binary heap of [cost, id]
  const heap: [number, string][] = [[0, start]];
  const less = (a: [number, string], b: [number, string]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const push = (x: [number, string]) => {
    heap.push(x);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const pop = (): [number, string] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };

  while (heap.length) {
    const [d, id] = pop();
    if (done.has(id)) continue;
    done.add(id);
    for (const [n, edge] of neighbours(g, id)) {
      const nd = d + (edge === "up" ? UP : edge === "down" ? DOWN : SPOUSE);
      const best = dist.get(n);
      if (best === undefined || nd < best || (nd === best && prev.get(n) && id < prev.get(n)!.from)) {
        if (best === undefined || nd < best) push([nd, n]);
        dist.set(n, nd);
        prev.set(n, { from: id, edge });
      }
    }
  }
  return prev;
}

function pathTo(prev: Map<string, Prev | null>, id: string): { nodes: string[]; edges: Edge[] } | null {
  if (!prev.has(id)) return null;
  const nodes = [id];
  const edges: Edge[] = [];
  for (let p = prev.get(id); p; p = prev.get(p.from)) {
    nodes.push(p.from);
    edges.push(p.edge);
  }
  return { nodes: nodes.reverse(), edges: edges.reverse() };
}

// ---------- age: who is elder ----------

/** Is `to` elder (e) or younger (y) than `from`? Unknown (?) when we can't tell. */
export function relativeAge(from: GPerson, to: GPerson, useBirthOrder: boolean): "e" | "y" | "?" {
  // Birth order is entered on purpose, so it beats a date. Only meaningful between siblings.
  if (useBirthOrder && from.ord != null && to.ord != null && from.ord !== to.ord) return to.ord < from.ord ? "e" : "y";
  if (from.dob && to.dob && from.dobp !== "unknown" && to.dobp !== "unknown" && from.dob !== to.dob) {
    return to.dob < from.dob ? "e" : "y";
  }
  return "?";
}

function siblingAtom(from: GPerson, to: GPerson, useBirthOrder: boolean): Atom {
  const age = relativeAge(from, to, useBirthOrder);
  if (to.g === "male") return age === "e" ? "eB" : age === "y" ? "yB" : "B";
  if (to.g === "female") return age === "e" ? "eZ" : age === "y" ? "yZ" : "Z";
  return "G";
}

const isSib = (a: Atom) => a === "eB" || a === "yB" || a === "B" || a === "eZ" || a === "yZ" || a === "Z" || a === "G";
const isMaleSib = (a: Atom) => a === "eB" || a === "yB" || a === "B";
const isFemaleSib = (a: Atom) => a === "eZ" || a === "yZ" || a === "Z";
const isChild = (a: Atom) => a === "S" || a === "D" || a === "C";

function toChain(g: Graph, nodes: string[], edges: Edge[]): Atom[] {
  const chain: Atom[] = [];
  const P = (id: string) => g.persons.get(id)!;
  for (let i = 0; i < edges.length; i++) {
    const target = P(nodes[i + 1]);
    if (edges[i] === "up" && edges[i + 1] === "down") {
      // up to a parent, then down to their other child = a sibling
      chain.push(siblingAtom(P(nodes[i]), P(nodes[i + 2]), true));
      i++;
    } else if (edges[i] === "up") chain.push(target.g === "male" ? "F" : target.g === "female" ? "M" : "P");
    else if (edges[i] === "down") chain.push(target.g === "male" ? "S" : target.g === "female" ? "D" : "C");
    else chain.push(target.g === "male" ? "H" : target.g === "female" ? "W" : "X");
  }
  return chain;
}

// ---------- plain English description (always available) ----------

const WORD: Record<Atom, string> = {
  F: "father", M: "mother", P: "parent", S: "son", D: "daughter", C: "child",
  H: "husband", W: "wife", X: "spouse",
  eB: "elder brother", yB: "younger brother", B: "brother",
  eZ: "elder sister", yZ: "younger sister", Z: "sister", G: "sibling",
};

export function describeChain(chain: Atom[]): string {
  if (!chain.length) return "You";
  const text = chain.map((a, i) => (i < chain.length - 1 ? `${WORD[a]}'s` : WORD[a])).join(" ");
  return text[0].toUpperCase() + text.slice(1);
}

// ---------- chain -> term ----------

const relaxAge = (a: Atom): Atom => (a === "eB" || a === "yB" ? "B" : a === "eZ" || a === "yZ" ? "Z" : a);

function lookup(chain: Atom[]): Term | null {
  return TERMS[chain.join(" ")] ?? TERMS[chain.map(relaxAge).join(" ")] ?? null;
}

const term = (ta: string, tr: string, hi: string, en: string, hint?: string): Term => ({ ta, tr, hi, en, hint });

/** Tamil word for a sibling when used inside "X's son" (Annan magan, Akka magal...). */
const SIB_TA: Record<string, [string, string]> = {
  eB: ["அண்ணன்", "Annan"], yB: ["தம்பி", "Thambi"], B: ["சகோதரன்", "Sagodharan"],
  eZ: ["அக்கா", "Akka"], yZ: ["தங்கை", "Thangai"], Z: ["சகோதரி", "Sagodhari"],
};

interface Resolved {
  term: Term | null;
  cousin: boolean;
}

function resolve(g: Graph, ego: GPerson, target: GPerson, chain: Atom[], desc: string): Resolved {
  const first = chain[0];
  const last = chain[chain.length - 1];

  // Parallel cousins (father's brother's child, mother's sister's child) are called brother and sister.
  if (chain.length === 3 && (first === "F" || first === "M") && isSib(chain[1]) && isChild(last)) {
    const parallel = (first === "F" && isMaleSib(chain[1])) || (first === "M" && isFemaleSib(chain[1]));
    if (parallel) {
      const sib = siblingAtom(ego, target, false); // dates only: birth order is for siblings
      const base = TERMS[sib];
      if (base) {
        const en = target.g === "male" ? "Cousin brother" : target.g === "female" ? "Cousin sister" : "Cousin";
        return { term: { ...base, en, hint: `${desc}. Called brother or sister.` }, cousin: true };
      }
    }
  }

  // Brother's or sister's child.
  if (chain.length === 2 && isSib(chain[0]) && isChild(last)) {
    const sib = chain[0];
    const boy = last === "S";
    const girl = last === "D";
    const hiSon = isMaleSib(sib) ? "Bhatija" : "Bhanja";
    const hiDau = isMaleSib(sib) ? "Bhatiji" : "Bhanji";
    const en = boy ? "Nephew" : girl ? "Niece" : "Nephew or niece";
    const hi = boy ? hiSon : girl ? hiDau : `${hiSon} / ${hiDau}`;
    const sameSex = (ego.g === "male" && isMaleSib(sib)) || (ego.g === "female" && isFemaleSib(sib));
    const knownSex = ego.g === "male" || ego.g === "female";
    if (knownSex && (boy || girl) && SIB_TA[sib]) {
      if (sameSex) {
        const [ta, tr] = SIB_TA[sib];
        return { term: term(`${ta} ${boy ? "மகன்" : "மகள்"}`, `${tr} ${boy ? "magan" : "magal"}`, hi, en, desc), cousin: false };
      }
      return { term: term(boy ? "மருமகன்" : "மருமகள்", boy ? "Marumagan" : "Marumagal", hi, en, desc), cousin: false };
    }
    if (boy || girl) return { term: term(boy ? "மகன் / மருமகன்" : "மகள் / மருமகள்", boy ? "Magan / Marumagan" : "Magal / Marumagal", hi, en, "Add your gender to see the exact name."), cousin: false };
  }

  // Great-grandparents and great-grandchildren: Kollu, Ellu.
  if (chain.length >= 3 && chain.length <= 4) {
    const g4 = GREAT[chain.length];
    if (chain.every((a) => a === "F" || a === "M") && (last === "F" || last === "M")) {
      const male = last === "F";
      const great = chain.length === 3 ? "Great-grand" : "Great-great-grand";
      return { term: term(g4.up[male ? 0 : 1], "", male ? "Pardada" : "Pardadi", great + (male ? "father" : "mother"), desc), cousin: false };
    }
    if (chain.every((a) => a === "S" || a === "D") && (last === "S" || last === "D")) {
      const male = last === "S";
      const great = chain.length === 3 ? "Great-grand" : "Great-great-grand";
      return { term: term(g4.down[male ? 0 : 1], "", male ? "Parpota" : "Parpoti", great + (male ? "son" : "daughter"), desc), cousin: false };
    }
  }

  // Brother or sister of a grandparent.
  if (chain.length === 3 && (first === "F" || first === "M") && (chain[1] === "F" || chain[1] === "M") && isSib(last)) {
    const paternal = first === "F";
    if (isMaleSib(last)) {
      const ta = last === "eB" ? "பெரிய தாத்தா" : last === "yB" ? "சின்ன தாத்தா" : "பெரிய / சின்ன தாத்தா";
      const tr = last === "eB" ? "Periya thatha" : last === "yB" ? "Chinna thatha" : "Periya / Chinna thatha";
      return { term: term(ta, tr, paternal ? "Dada" : "Nana", "Grand-uncle", desc), cousin: false };
    }
    if (isFemaleSib(last)) return { term: term("பாட்டி", "Paati", paternal ? "Dadi" : "Nani", "Grand-aunt", desc), cousin: false };
  }

  const found = lookup(chain);
  if (found) {
    // Ambiguous only because ages are missing: say what to add.
    return { term: found, cousin: false };
  }
  return { term: null, cousin: false };
}

function sideOf(chain: Atom[]): Side {
  if (!chain.length) return "self";
  const a = chain[0];
  if (a === "F") return "paternal";
  if (a === "M") return "maternal";
  if (a === "H" || a === "W" || a === "X") return "inlaw";
  if (a === "P") return "other";
  return "own"; // siblings and children, and everyone who hangs off them
}

/** Relationship of every person in the family to `egoId`. People not connected to them are left out. */
export function computeRelations(g: Graph, egoId: string): Map<string, Relation> {
  const out = new Map<string, Relation>();
  const ego = g.persons.get(egoId);
  if (!ego) return out;
  const prev = shortestPaths(g, egoId);

  for (const id of g.persons.keys()) {
    if (id === egoId) {
      out.set(id, { chain: [], term: SELF, desc: "You", side: "self", cousin: false });
      continue;
    }
    const path = pathTo(prev, id);
    if (!path) continue;
    const chain = toChain(g, path.nodes, path.edges);
    const desc = describeChain(chain);
    const target = g.persons.get(id)!;
    const { term, cousin } = resolve(g, ego, target, chain, desc);
    out.set(id, {
      chain,
      term: term ?? (chain.length > 4 ? DISTANT : null),
      desc,
      side: sideOf(chain),
      cousin,
    });
  }
  return out;
}

// ---------- what to show ----------

export type RelationStyle = "tamil" | "english_in" | "english_global";

export interface Label {
  title: string;
  sub: string;
}

export function labelFor(rel: Relation | null | undefined, style: RelationStyle): Label {
  if (!rel) return { title: "", sub: "" };
  const t = rel.term;
  if (!t) return { title: rel.desc, sub: "" };
  const hint = t.hint && t.hint !== rel.desc ? t.hint : "";
  if (style === "tamil") {
    const roman = t.tr && t.tr !== t.ta ? t.tr : "";
    return { title: t.ta, sub: [roman, t.en, hint || rel.desc].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ") };
  }
  if (style === "english_in") return { title: t.hi, sub: [t.en, hint || rel.desc].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ") };
  return { title: t.en, sub: t.en === rel.desc ? "" : hint || rel.desc };
}

export const STYLE_NAMES: Record<RelationStyle, string> = {
  tamil: "தமிழ் (Tamil)",
  english_in: "Indian (Hindi style)",
  english_global: "English",
};
