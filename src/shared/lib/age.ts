import type { Enums } from "./supabase";

type Precision = Enums<"date_precision_t">;

export interface Age {
  years: number;
  approx: boolean; // only the year (or a guess) is known
}

/**
 * Age in full years from DOB. If the person has died, age at death.
 * Returns null when DOB is unknown. Dates are "YYYY-MM-DD" strings.
 */
export function ageFrom(
  dob: string | null | undefined,
  precision: Precision,
  opts: { deathDate?: string | null; today?: Date } = {},
): Age | null {
  if (!dob || precision === "unknown") return null;
  const [by, bm, bd] = dob.split("-").map(Number);
  const end = opts.deathDate ? parseDate(opts.deathDate) : opts.today ?? new Date();
  const ey = end.getFullYear();
  const em = end.getMonth() + 1;
  const ed = end.getDate();

  let years = ey - by;
  if (precision === "exact") {
    if (em < bm || (em === bm && ed < bd)) years -= 1;
  } else if (precision === "month") {
    if (em < bm) years -= 1;
  }
  if (years < 0 || years > 130) return null;
  return { years, approx: precision === "year" || precision === "approx" };
}

export function formatAge(age: Age | null, isLiving: boolean): string {
  if (!age) return "";
  const n = `${age.approx ? "~" : ""}${age.years}`;
  return isLiving ? `${n} yrs` : `died at ${n}`;
}

/** Show a date at the precision we actually know. */
export function formatDate(date: string | null | undefined, precision: Precision): string {
  if (!date || precision === "unknown") return "";
  const d = parseDate(date);
  if (precision === "year") return String(d.getFullYear());
  if (precision === "approx") return `around ${d.getFullYear()}`;
  if (precision === "month") return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
