// Pure poll helpers (the database enforces the same rules; this is for friendly messages and the bars).

export interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  position: number;
  votes: number;
}

export interface Poll {
  id: string;
  room_id: string;
  question: string;
  created_by: string;
  closes_at: string | null;
  closed_at: string | null;
}

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;

export const isOpen = (p: Pick<Poll, "closes_at" | "closed_at">, now = Date.now()) =>
  !p.closed_at && (!p.closes_at || new Date(p.closes_at).getTime() > now);

export const totalVotes = (opts: Pick<PollOption, "votes">[]) => opts.reduce((n, o) => n + Math.max(0, o.votes), 0);

/** Whole-number percentages that add up to 100 (largest remainder), 0 for everyone when nobody voted. */
export function percents(opts: Pick<PollOption, "votes">[]): number[] {
  const total = totalVotes(opts);
  if (!total) return opts.map(() => 0);
  const raw = opts.map((o) => (Math.max(0, o.votes) * 100) / total);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/** Same cleaning the database does: trim, drop blanks, drop repeats ("Yes" = "yes"), keep order. */
export function cleanOptions(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = r.trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** An error message for the form, or null when it can be sent. */
export function pollProblem(question: string, rawOptions: string[]): string | null {
  const q = question.trim();
  if (!q) return "Write your question first.";
  if (q.length > 200) return "The question can be up to 200 letters.";
  const o = cleanOptions(rawOptions);
  if (o.length < MIN_OPTIONS) return "Add at least 2 different choices.";
  if (o.length > MAX_OPTIONS) return "A poll can have up to 5 choices.";
  if (o.some((x) => x.length > 80)) return "Each choice can be up to 80 letters.";
  return null;
}

export function closesLabel(p: Pick<Poll, "closes_at" | "closed_at">, now = Date.now()): string {
  if (p.closed_at) return "Closed";
  if (!p.closes_at) return "Open";
  const ms = new Date(p.closes_at).getTime() - now;
  if (ms <= 0) return "Closed";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 48) return `Closes in ${Math.floor(h / 24)} days`;
  if (h >= 1) return `Closes in ${h} hour${h === 1 ? "" : "s"}`;
  return "Closes soon";
}

/** After my own tap: show the new count at once. Real counts replace it when the server answers. */
export function withMyVote(opts: PollOption[], before: string | null, now: string): PollOption[] {
  if (before === now) return opts;
  return opts.map((o) => (o.id === before ? { ...o, votes: Math.max(0, o.votes - 1) } : o.id === now ? { ...o, votes: o.votes + 1 } : o));
}
