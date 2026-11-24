import type { Enums, DB } from "./supabase";

type Json = DB["Functions"]["family_graph"]["Returns"];

/** Compact person shape returned by the family_graph RPC. */
export interface GPerson {
  id: string;
  name: string;
  nick: string | null;
  g: Enums<"gender_t">;
  dob: string | null;
  dobp: Enums<"date_precision_t">;
  ord: number | null;
  alive: boolean;
  dod: string | null;
  photo: string | null;
  uid: string | null;
  mgr: string | null;
  state: string | null;
  /** Native place (oor). */
  np?: string | null;
  /** How exactly the death date is known. */
  dodp?: Enums<"date_precision_t">;
}

export interface Union {
  a: string;
  b: string;
  married: string | null;
  ended: string | null;
  reason: string | null;
  /** How exactly the marriage date is known. */
  precision: Enums<"date_precision_t">;
}

export interface Graph {
  persons: Map<string, GPerson>;
  parentsOf: Map<string, { id: string; kind: Enums<"parent_kind_t"> }[]>;
  childrenOf: Map<string, string[]>;
  unionsOf: Map<string, Union[]>;
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};

export function buildGraph(raw: Json): Graph {
  const r = (raw ?? {}) as {
    persons?: GPerson[];
    parents?: [string, string, Enums<"parent_kind_t">][];
    unions?: [string, string, string | null, string | null, string | null, Enums<"date_precision_t">?][];
  };
  const g: Graph = { persons: new Map(), parentsOf: new Map(), childrenOf: new Map(), unionsOf: new Map() };
  for (const p of r.persons ?? []) g.persons.set(p.id, p);
  for (const [parent, child, kind] of r.parents ?? []) {
    push(g.parentsOf, child, { id: parent, kind });
    push(g.childrenOf, parent, child);
  }
  for (const [a, b, married, ended, reason, precision] of r.unions ?? []) {
    const u: Union = { a, b, married, ended, reason, precision: precision ?? (married ? "exact" : "unknown") };
    push(g.unionsOf, a, u);
    push(g.unionsOf, b, u);
  }
  return g;
}

/** Elder first: birth order if known, then DOB, then name. */
export function byAge(g: Graph) {
  return (x: string, y: string) => {
    const a = g.persons.get(x);
    const b = g.persons.get(y);
    if (!a || !b) return 0;
    if (a.ord != null && b.ord != null && a.ord !== b.ord) return a.ord - b.ord;
    if (a.dob && b.dob && a.dob !== b.dob) return a.dob < b.dob ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
}

export const parentsOf = (g: Graph, id: string) => (g.parentsOf.get(id) ?? []).map((p) => p.id);
export const childrenOf = (g: Graph, id: string) => [...(g.childrenOf.get(id) ?? [])].sort(byAge(g));
export const spousesOf = (g: Graph, id: string) =>
  (g.unionsOf.get(id) ?? []).map((u) => ({ id: u.a === id ? u.b : u.a, union: u }));

/** Anyone who shares at least one parent. Sorted elder first. */
export function siblingsOf(g: Graph, id: string): string[] {
  const out = new Set<string>();
  for (const p of parentsOf(g, id)) for (const c of g.childrenOf.get(p) ?? []) if (c !== id) out.add(c);
  return [...out].sort(byAge(g));
}

/**
 * Generation of every person relative to `me` (0 = my generation,
 * -1 = parents, +1 = children). Walks outward from `me`, first visit wins.
 * People not connected to `me` are placed from their own starting point.
 * Never loops, even with uncle-niece (Thai Mama) marriages.
 */
export function generations(g: Graph, me: string | null): Map<string, number> {
  const level = new Map<string, number>();
  const seeds = [...(me && g.persons.has(me) ? [me] : []), ...g.persons.keys()];
  for (const seed of seeds) {
    if (level.has(seed)) continue;
    level.set(seed, 0);
    const queue = [seed];
    while (queue.length) {
      const id = queue.shift()!;
      const l = level.get(id)!;
      const next: [string, number][] = [
        ...spousesOf(g, id).map((s) => [s.id, l] as [string, number]),
        ...parentsOf(g, id).map((p) => [p, l - 1] as [string, number]),
        ...(g.childrenOf.get(id) ?? []).map((c) => [c, l + 1] as [string, number]),
      ];
      for (const [n, nl] of next) {
        if (!level.has(n)) {
          level.set(n, nl);
          queue.push(n);
        }
      }
    }
  }
  return level;
}

export function generationLabel(n: number): string {
  const names: Record<number, string> = {
    [-3]: "Great-grandparents' generation",
    [-2]: "Grandparents' generation",
    [-1]: "Parents' generation",
    0: "Your generation",
    1: "Children's generation",
    2: "Grandchildren's generation",
    3: "Great-grandchildren's generation",
  };
  return names[n] ?? (n < 0 ? `${-n} generations up` : `${n} generations down`);
}
