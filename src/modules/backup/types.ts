import type { Enums } from "@/shared/lib/supabase";

export type Gender = Enums<"gender_t">;
export type Precision = Enums<"date_precision_t">;
export type ParentKind = Enums<"parent_kind_t">;

/** What export_family returns. Version 1. */
export interface BackupData {
  format: "nammoor-family-backup";
  version: 1;
  exported_at: string;
  family: { name: string; native_place: string | null };
  persons: BackupPerson[];
  parent_child: { parent_id: string; child_id: string; kind: ParentKind }[];
  unions: { partner_a: string; partner_b: string; married_on: string | null; married_precision: Precision; ended_on: string | null; end_reason: Enums<"union_end_t"> | null }[];
  education: { person_id: string; level: string; course: string | null; institution: string | null; year_completed: number | null }[];
  occupations: { person_id: string; title: string; organization: string | null; city: string | null; is_current: boolean; start_year: number | null; end_year: number | null }[];
  /** Derived from the dates above. For people reading the file. Ignored on import. */
  events?: { type: "birth" | "marriage" | "death"; date: string | null; precision: Precision; people: string[] }[];
}

export interface BackupPerson {
  id: string;
  full_name: string;
  initials: string | null;
  nickname: string | null;
  name_native: string | null;
  gender: Gender;
  birth_date: string | null;
  birth_precision: Precision;
  birth_time: string | null;
  birth_place: string | null;
  birth_order: number | null;
  is_living: boolean;
  death_date: string | null;
  death_precision: Precision;
  native_place: string | null;
  current_city: string | null;
  state_code: string | null;
  country_code: string | null;
  history: string | null;
}

// ---- what the importer works with (already cleaned, safe to send) ----

export interface ImportPerson {
  ref: string;
  full_name: string;
  gender: Gender;
  birth_date: string | null;
  birth_precision: Precision;
  birth_time: string | null;
  birth_place: string | null;
  birth_order: number | null;
  is_living: boolean;
  death_date: string | null;
  death_precision: Precision;
  native_place: string | null;
  current_city: string | null;
  state_code: string | null;
  country_code: string | null;
  history: string | null;
  nickname: string | null;
  initials: string | null;
  name_native: string | null;
  education: { level: string; course: string | null; institution: string | null; year_completed: number | null }[];
  occupations: { title: string; organization: string | null; city: string | null; is_current: boolean; start_year: number | null; end_year: number | null }[];
}

export interface ImportUnion {
  a: string;
  b: string;
  married_on: string | null;
  married_precision: Precision;
  ended_on: string | null;
  end_reason: Enums<"union_end_t"> | null;
}

export interface ImportData {
  source: "nammoor-json" | "gedcom";
  familyName: string | null;
  persons: ImportPerson[];
  parents: [string, string, ParentKind][];
  unions: ImportUnion[];
  /** Things we could not read or had to change. Shown to the person. */
  warnings: string[];
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PEOPLE = 2000;
