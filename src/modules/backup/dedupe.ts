import type { GPerson, Graph } from "@/shared/lib/graph";
import type { ImportData, ImportPerson } from "./types";

export interface Match {
  /** Existing person this one looks like. */
  id: string;
  /** same = same name and same birth year. maybe = same name, but we can't compare years. */
  confidence: "same" | "maybe";
}

/** Letters and digits only, any language, so "S. Ramasamy" and "s ramasamy" match. */
export const nameKey = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const year = (d: string | null | undefined, p: string | undefined) => (d && p !== "unknown" ? Number(d.slice(0, 4)) : null);

function compare(inc: ImportPerson, ex: GPerson): Match["confidence"] | null {
  if (!nameKey(inc.full_name) || nameKey(inc.full_name) !== nameKey(ex.name)) return null;
  if (inc.gender !== "unknown" && ex.g !== "unknown" && inc.gender !== ex.g) return null;
  const a = year(inc.birth_date, inc.birth_precision);
  const b = year(ex.dob, ex.dobp);
  if (a !== null && b !== null) return a === b ? "same" : null; // different years = different people
  return "maybe";
}

/** For every person in the file, the best match already in the family (if any). */
export function findMatches(g: Graph, data: ImportData): Map<string, Match> {
  const byName = new Map<string, GPerson[]>();
  for (const p of g.persons.values()) byName.set(nameKey(p.name), [...(byName.get(nameKey(p.name)) ?? []), p]);
  const taken = new Set<string>(); // an existing person can be matched once
  const out = new Map<string, Match>();
  // "same" first so a real match is not stolen by a vague one
  for (const want of ["same", "maybe"] as const)
    for (const inc of data.persons) {
      if (out.has(inc.ref)) continue;
      for (const ex of byName.get(nameKey(inc.full_name)) ?? []) {
        if (taken.has(ex.id) || compare(inc, ex) !== want) continue;
        taken.add(ex.id);
        out.set(inc.ref, { id: ex.id, confidence: want });
        break;
      }
    }
  return out;
}

export type Choice = "new" | "link";

export interface Plan {
  added: number;
  linked: number;
  newParentLinks: number;
  newMarriages: number;
  /** Stop: the database would refuse these. */
  errors: string[];
}

/**
 * What an import will do, and whether it can work. Checks the same rules the database
 * enforces (two biological parents, nobody their own ancestor) so people see a clear
 * message here instead of a failed import.
 */
export function planImport(g: Graph, data: ImportData, matches: Map<string, Match>, choices: Map<string, Choice>): Plan {
  const errors: string[] = [];
  const target = (ref: string): string => (choices.get(ref) === "link" && matches.get(ref) ? matches.get(ref)!.id : `new:${ref}`);
  const linked = data.persons.filter((p) => choices.get(p.ref) === "link" && matches.has(p.ref)).length;
  const name = new Map(data.persons.map((p) => [p.ref, p.full_name]));
  const nameOf = (id: string) => (id.startsWith("new:") ? name.get(id.slice(4)) : g.persons.get(id)?.name) ?? "someone";

  // parents of everyone after the import
  const parents = new Map<string, Map<string, string>>(); // child -> parent -> kind
  for (const [child, list] of g.parentsOf) parents.set(child, new Map(list.map((p) => [p.id, p.kind])));
  let newLinks = 0;
  for (const [pa, ch, kind] of data.parents) {
    const [p, c] = [target(pa), target(ch)];
    if (p === c) continue;
    const m = parents.get(c) ?? new Map<string, string>();
    if (!m.has(p)) {
      m.set(p, kind);
      newLinks++;
    }
    parents.set(c, m);
  }
  for (const [child, m] of parents) {
    const bio = [...m.values()].filter((k) => k === "biological").length;
    if (bio > 2) errors.push(`${nameOf(child)} would have ${bio} biological parents. A person can have at most 2.`);
  }
  // nobody can be their own ancestor
  const state = new Map<string, 1 | 2>();
  let cycleAt: string | null = null;
  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) {
      cycleAt = id;
      return true;
    }
    state.set(id, 1);
    for (const p of parents.get(id)?.keys() ?? []) if (visit(p)) return true;
    state.set(id, 2);
    return false;
  };
  for (const id of parents.keys()) if (visit(id)) break;
  if (cycleAt) errors.push(`${nameOf(cycleAt)} would become their own ancestor. Check the family links in the file.`);

  // marriages that are new
  const have = new Set<string>();
  for (const list of g.unionsOf.values()) for (const u of list) have.add([u.a, u.b].sort().join("|"));
  const fresh = new Set<string>();
  for (const u of data.unions) {
    const key = [target(u.a), target(u.b)].sort().join("|");
    if (!have.has(key)) fresh.add(key);
  }
  return { added: data.persons.length - linked, linked, newParentLinks: newLinks, newMarriages: fresh.size, errors };
}

/** The payload import_family_data expects. */
export function toPayload(data: ImportData, matches: Map<string, Match>, choices: Map<string, Choice>) {
  return {
    persons: data.persons.map((p) => ({ ...p, existing: choices.get(p.ref) === "link" ? matches.get(p.ref)?.id ?? null : null })),
    parents: data.parents,
    unions: data.unions.map((u) => [u.a, u.b, u.married_on, u.married_precision, u.ended_on, u.end_reason]),
  };
}
