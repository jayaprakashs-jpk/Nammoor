import { ageFrom } from "@/shared/lib/age";
import type { GPerson, Graph } from "@/shared/lib/graph";

export type Status = "all" | "living" | "deceased";
export type SortBy = "generation" | "name" | "oldest" | "youngest" | "place";

export interface ListOptions {
  query: string;
  place: string;
  status: Status;
  missingBirthDate: boolean;
  sort: SortBy;
}

export const DEFAULT_LIST: ListOptions = { query: "", place: "", status: "all", missingBirthDate: false, sort: "generation" };

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

export const hasBirthDate = (p: GPerson) => !!p.dob && p.dobp !== "unknown";

/** Places people come from, most common first. */
export function placesIn(g: Graph): string[] {
  const count = new Map<string, { n: number; label: string }>();
  for (const p of g.persons.values()) {
    const label = p.np?.trim().replace(/\s+/g, " ");
    if (!label) continue;
    const e = count.get(norm(label)) ?? { n: 0, label };
    e.n++;
    count.set(norm(label), e);
  }
  return [...count.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((e) => e.label);
}

/** Which of `ids` pass the filters, in the order asked for. "generation" keeps the caller's order. */
export function filterPeople(g: Graph, ids: Iterable<string>, o: ListOptions, today: Date = new Date()): string[] {
  const q = norm(o.query);
  const place = norm(o.place);
  const out: GPerson[] = [];
  for (const id of ids) {
    const p = g.persons.get(id);
    if (!p) continue;
    if (q && !norm(`${p.name} ${p.nick ?? ""} ${p.np ?? ""}`).includes(q)) continue;
    if (place && norm(p.np ?? "") !== place) continue;
    if (o.status === "living" && !p.alive) continue;
    if (o.status === "deceased" && p.alive) continue;
    if (o.missingBirthDate && hasBirthDate(p)) continue;
    out.push(p);
  }
  const years = (p: GPerson) => ageFrom(p.dob, p.dobp, { deathDate: p.dod, today })?.years ?? null;
  const byName = (a: GPerson, b: GPerson) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  if (o.sort === "name") out.sort(byName);
  else if (o.sort === "place") out.sort((a, b) => Number(!a.np) - Number(!b.np) || (a.np ?? "").localeCompare(b.np ?? "") || byName(a, b));
  else if (o.sort === "oldest" || o.sort === "youngest") {
    // by birth date, not by age at death, so the dead sort sensibly too. People with no date go last.
    const key = (p: GPerson) => (hasBirthDate(p) ? p.dob! : null);
    out.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka === null || kb === null) return Number(ka === null) - Number(kb === null) || byName(a, b);
      return (o.sort === "oldest" ? ka.localeCompare(kb) : kb.localeCompare(ka)) || byName(a, b);
    });
  }
  void years;
  return out.map((p) => p.id);
}
