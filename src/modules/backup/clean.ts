import type { Gender, ImportPerson, ParentKind, Precision } from "./types";

// Everything that comes from a file is untrusted. These make it fit the database rules
// so one odd value doesn't fail the whole import.

export const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\u0000/g, "").trim();
  return t ? t.slice(0, max) : null;
};

export function isoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const dim = new Date(y, mo, 0).getDate(); // days in that month
  return d > dim ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

const GENDERS: Gender[] = ["male", "female", "other", "unknown"];
const PRECISIONS: Precision[] = ["exact", "month", "year", "approx", "unknown"];
const KINDS: ParentKind[] = ["biological", "adopted", "step", "foster"];
const LEVELS = ["school", "diploma", "iti", "ug", "pg", "doctorate", "other"];

export const gender = (v: unknown): Gender => (GENDERS.includes(v as Gender) ? (v as Gender) : "unknown");
export const kind = (v: unknown): ParentKind => (KINDS.includes(v as ParentKind) ? (v as ParentKind) : "biological");
export const precision = (v: unknown, date: string | null): Precision =>
  !date ? "unknown" : PRECISIONS.includes(v as Precision) && v !== "unknown" ? (v as Precision) : "exact";
const year = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1900 && v <= 2100 ? v : null);

/** Make one person safe and complete. `warn` collects what was changed. */
export function cleanPerson(raw: Record<string, unknown>, ref: string, warn: (m: string) => void): ImportPerson {
  const name = text(raw.full_name, 120) ?? "Unknown";
  const birth = isoDate(raw.birth_date);
  const death = isoDate(raw.death_date);
  if (raw.birth_date && !birth) warn(`${name}: birth date "${String(raw.birth_date).slice(0, 20)}" was not understood and was left empty.`);
  if (raw.death_date && !death) warn(`${name}: death date "${String(raw.death_date).slice(0, 20)}" was not understood and was left empty.`);
  const order = typeof raw.birth_order === "number" && Number.isInteger(raw.birth_order) && raw.birth_order >= 1 && raw.birth_order <= 30 ? raw.birth_order : null;
  const state = typeof raw.state_code === "string" && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(raw.state_code) ? raw.state_code : null;
  const country = typeof raw.country_code === "string" && /^[A-Z]{2}$/.test(raw.country_code) ? raw.country_code : null;
  const time = typeof raw.birth_time === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(raw.birth_time) ? raw.birth_time : null;
  const edu = Array.isArray(raw.education) ? raw.education : [];
  const occ = Array.isArray(raw.occupations) ? raw.occupations : [];
  return {
    ref,
    full_name: name,
    gender: gender(raw.gender),
    birth_date: birth,
    birth_precision: precision(raw.birth_precision, birth),
    birth_time: time,
    birth_place: text(raw.birth_place, 120),
    birth_order: order,
    // someone with a death date is not living, whatever the file says
    is_living: death ? false : raw.is_living === false ? false : true,
    death_date: death,
    death_precision: precision(raw.death_precision, death),
    native_place: text(raw.native_place, 120),
    current_city: text(raw.current_city, 120),
    state_code: state,
    country_code: country,
    history: text(raw.history, 5000),
    nickname: text(raw.nickname, 60),
    initials: text(raw.initials, 12),
    name_native: text(raw.name_native, 120),
    education: edu.slice(0, 20).map((e: Record<string, unknown>) => ({
      level: LEVELS.includes(e?.level as string) ? (e.level as string) : "other",
      course: text(e?.course, 120), institution: text(e?.institution, 160), year_completed: year(e?.year_completed),
    })),
    occupations: occ.slice(0, 20).filter((o: Record<string, unknown>) => text(o?.title, 120)).map((o: Record<string, unknown>) => ({
      title: text(o.title, 120)!, organization: text(o.organization, 160), city: text(o.city, 120),
      is_current: o.is_current !== false, start_year: year(o.start_year), end_year: year(o.end_year),
    })),
  };
}
