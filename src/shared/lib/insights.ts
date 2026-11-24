import { ageFrom } from "./age";
import type { Graph } from "./graph";

export interface Insights {
  total: number;
  living: number;
  deceased: number;
  oldestLiving: { id: string; years: number; approx: boolean } | null;
  topPlaces: { place: string; count: number }[];
  missingBirthDate: number;
  marriages: number;
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/** Numbers for the insights card. Places are grouped ignoring case and spacing. */
export function computeInsights(g: Graph, today: Date = new Date(), topN = 5): Insights {
  let living = 0;
  let missing = 0;
  let oldest: Insights["oldestLiving"] = null;
  const places = new Map<string, { count: number; spellings: Map<string, number> }>();

  for (const p of g.persons.values()) {
    if (p.alive) living++;
    if (!p.dob || p.dobp === "unknown") missing++;
    if (p.alive) {
      const a = ageFrom(p.dob, p.dobp, { today });
      if (a && (!oldest || a.years > oldest.years || (a.years === oldest.years && !a.approx && oldest.approx))) {
        oldest = { id: p.id, years: a.years, approx: a.approx };
      }
    }
    const place = p.np ? clean(p.np) : "";
    if (place) {
      const key = place.toLowerCase();
      const e = places.get(key) ?? { count: 0, spellings: new Map() };
      e.count++;
      e.spellings.set(place, (e.spellings.get(place) ?? 0) + 1);
      places.set(key, e);
    }
  }

  const topPlaces = [...places.values()]
    .map((e) => ({
      place: [...e.spellings.entries()].sort(
        (a, b) => b[1] - a[1] || Number(b[0][0] === b[0][0].toUpperCase()) - Number(a[0][0] === a[0][0].toUpperCase()) || a[0].localeCompare(b[0]),
      )[0][0],
      count: e.count,
    }))
    .sort((a, b) => b.count - a.count || a.place.localeCompare(b.place))
    .slice(0, topN);

  const seen = new Set<string>();
  for (const list of g.unionsOf.values()) for (const u of list) seen.add([u.a, u.b].sort().join("|"));

  return {
    total: g.persons.size,
    living,
    deceased: g.persons.size - living,
    oldestLiving: oldest,
    topPlaces,
    missingBirthDate: missing,
    marriages: seen.size,
  };
}
