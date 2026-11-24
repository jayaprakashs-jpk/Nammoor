import type { Graph } from "./graph";

export type EventKind = "birth" | "marriage" | "death";

export interface TimelineEvent {
  kind: EventKind;
  /** Calendar year. */
  year: number;
  /** "YYYY-MM-DD" when the day is known exactly, otherwise null. */
  date: string | null;
  /** Tapping opens the first person. */
  people: string[];
  approx: boolean;
}

const yearOf = (d: string) => Number(d.slice(0, 4));
const sortKey = (e: TimelineEvent) => (e.date ? e.year * 10000 + Number(e.date.slice(5, 7)) * 100 + Number(e.date.slice(8, 10)) : e.year * 10000 + 9999);

/** Every birth, marriage and death in the tree, oldest first. Unknown dates are left out. */
export function buildTimeline(g: Graph): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const p of g.persons.values()) {
    if (p.dob && p.dobp !== "unknown")
      out.push({ kind: "birth", year: yearOf(p.dob), date: p.dobp === "exact" ? p.dob : null, people: [p.id], approx: p.dobp === "approx" });
    if (!p.alive && p.dod && p.dodp !== "unknown")
      out.push({ kind: "death", year: yearOf(p.dod), date: p.dodp === "exact" || p.dodp === undefined ? p.dod : null, people: [p.id], approx: p.dodp === "approx" });
  }
  const seen = new Set<string>();
  for (const list of g.unionsOf.values())
    for (const u of list) {
      const key = [u.a, u.b].sort().join("|");
      if (seen.has(key) || !u.married || u.precision === "unknown") continue;
      seen.add(key);
      out.push({ kind: "marriage", year: yearOf(u.married), date: u.precision === "exact" ? u.married : null, people: [u.a, u.b], approx: u.precision === "approx" });
    }
  return out.sort((a, b) => sortKey(a) - sortKey(b) || a.kind.localeCompare(b.kind) || a.people[0].localeCompare(b.people[0]));
}

export interface Reminder {
  kind: "birthday" | "anniversary" | "remembrance";
  /** 0 = today. */
  inDays: number;
  /** "YYYY-MM-DD" of the coming date. */
  on: string;
  /** Age being turned, or years married, or years since death. */
  years: number;
  people: string[];
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = (n: number) => String(n).padStart(2, "0");

/** The next time month/day happens on or after `today`. 29 Feb counts as 28 Feb in other years. */
function nextOccurrence(month: number, day: number, today: Date): Date {
  const t = dayStart(today);
  for (const y of [t.getFullYear(), t.getFullYear() + 1]) {
    const d = month === 2 && day === 29 && !isLeap(y) ? 28 : day;
    const c = new Date(y, month - 1, d);
    if (c >= t) return c;
  }
  return new Date(t.getFullYear() + 1, month - 1, day);
}

const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Birthdays, wedding anniversaries and death anniversaries in the next `days` days. Only exact dates count. */
export function upcomingReminders(g: Graph, today: Date = new Date(), days = 30): Reminder[] {
  const t0 = dayStart(today);
  const out: Reminder[] = [];
  const add = (kind: Reminder["kind"], date: string, people: string[]) => {
    const m = Number(date.slice(5, 7));
    const d = Number(date.slice(8, 10));
    const next = nextOccurrence(m, d, t0);
    const inDays = Math.round((next.getTime() - t0.getTime()) / 86400000);
    const years = next.getFullYear() - yearOf(date);
    if (inDays <= days && years >= 1) out.push({ kind, inDays, on: iso(next), years, people });
  };

  for (const p of g.persons.values()) {
    if (p.alive && p.dob && p.dobp === "exact") add("birthday", p.dob, [p.id]);
    if (!p.alive && p.dod && (p.dodp === "exact" || p.dodp === undefined) && p.dod.length === 10) add("remembrance", p.dod, [p.id]);
  }
  const seen = new Set<string>();
  for (const list of g.unionsOf.values())
    for (const u of list) {
      const key = [u.a, u.b].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const a = g.persons.get(u.a);
      const b = g.persons.get(u.b);
      // Anniversaries are for marriages still going, with both people alive.
      if (!u.married || u.precision !== "exact" || u.ended || !a?.alive || !b?.alive) continue;
      add("anniversary", u.married, [u.a, u.b]);
    }
  const rank = { birthday: 0, anniversary: 1, remembrance: 2 };
  return out.sort((a, b) => a.inDays - b.inDays || rank[a.kind] - rank[b.kind] || a.people[0].localeCompare(b.people[0]));
}
