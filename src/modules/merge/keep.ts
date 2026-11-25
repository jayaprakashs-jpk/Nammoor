import type { GPerson } from "@/shared/lib/graph";

const filled = (p: GPerson) => [p.photo, p.dob && p.dobp !== "unknown" ? 1 : null, p.dod, p.np, p.nt, p.nick].filter(Boolean).length;

/**
 * Which of two cards should stay when they are merged. Never a hard rule: an admin sees both and decides.
 * The person who has an account stays. Otherwise the one with more filled in. A tie keeps `a`.
 */
export function suggestKeep(a: GPerson, b: GPerson): { keep: GPerson; drop: GPerson } {
  if (a.uid && !b.uid) return { keep: a, drop: b };
  if (b.uid && !a.uid) return { keep: b, drop: a };
  return filled(b) > filled(a) ? { keep: b, drop: a } : { keep: a, drop: b };
}
