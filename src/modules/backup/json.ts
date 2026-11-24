import { cleanPerson, isoDate, kind, precision, text } from "./clean";
import { MAX_PEOPLE, type BackupData, type ImportData, type ImportUnion } from "./types";

const EVENT_ORDER = { birth: 0, marriage: 1, death: 2 } as const;

/** Add the readable "events" list to what the server exported. */
export function buildBackup(raw: Omit<BackupData, "events">): BackupData {
  const events: NonNullable<BackupData["events"]> = [];
  for (const p of raw.persons) {
    if (p.birth_date) events.push({ type: "birth", date: p.birth_date, precision: p.birth_precision, people: [p.id] });
    if (!p.is_living && p.death_date) events.push({ type: "death", date: p.death_date, precision: p.death_precision, people: [p.id] });
  }
  for (const u of raw.unions) if (u.married_on) events.push({ type: "marriage", date: u.married_on, precision: u.married_precision, people: [u.partner_a, u.partner_b] });
  events.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || EVENT_ORDER[a.type] - EVENT_ORDER[b.type]);
  return { ...raw, events };
}

export class ImportError extends Error {}

/** Read a Nammoor backup file. Throws ImportError with a message a person can understand. */
export function parseBackupJson(src: string): ImportData {
  let raw: unknown;
  try {
    raw = JSON.parse(src.replace(/^﻿/, ""));
  } catch {
    throw new ImportError("This file is not a valid backup (it is not readable JSON).");
  }
  const d = raw as Partial<BackupData> | null;
  if (!d || typeof d !== "object" || d.format !== "nammoor-family-backup") throw new ImportError("This is not a Nammoor family backup file.");
  if (typeof d.version !== "number" || d.version > 1) throw new ImportError("This backup was made by a newer version of Nammoor. Update the app first.");
  if (!Array.isArray(d.persons)) throw new ImportError("This backup has no people in it.");
  if (d.persons.length > MAX_PEOPLE) throw new ImportError(`This backup has ${d.persons.length} people. The limit is ${MAX_PEOPLE} per import.`);

  const warnings: string[] = [];
  const warn = (m: string) => warnings.length < 50 && warnings.push(m);
  const ids = new Set<string>();
  const education = new Map<string, unknown[]>();
  const occupations = new Map<string, unknown[]>();
  for (const e of Array.isArray(d.education) ? d.education : []) education.set(e.person_id, [...(education.get(e.person_id) ?? []), e]);
  for (const o of Array.isArray(d.occupations) ? d.occupations : []) occupations.set(o.person_id, [...(occupations.get(o.person_id) ?? []), o]);

  const persons = d.persons.flatMap((p, i) => {
    const id = typeof p?.id === "string" && p.id ? p.id : null;
    if (!id || ids.has(id)) {
      warn(`Person number ${i + 1} has a missing or repeated id and was skipped.`);
      return [];
    }
    ids.add(id);
    return [cleanPerson({ ...p, education: education.get(id), occupations: occupations.get(id) }, id, warn)];
  });

  let dropped = 0;
  const parents = (Array.isArray(d.parent_child) ? d.parent_child : []).flatMap((l) => {
    if (ids.has(l?.parent_id) && ids.has(l?.child_id) && l.parent_id !== l.child_id) return [[l.parent_id, l.child_id, kind(l.kind)] as [string, string, ReturnType<typeof kind>]];
    dropped++;
    return [];
  });
  const unions: ImportUnion[] = (Array.isArray(d.unions) ? d.unions : []).flatMap((u) => {
    if (!(ids.has(u?.partner_a) && ids.has(u?.partner_b)) || u.partner_a === u.partner_b) {
      dropped++;
      return [];
    }
    const married = isoDate(u.married_on);
    const ended = isoDate(u.ended_on);
    const reason = ended ? (["divorce", "death", "separation"].includes(u.end_reason as string) ? u.end_reason! : "separation") : null;
    return [{ a: u.partner_a, b: u.partner_b, married_on: married, married_precision: precision(u.married_precision, married), ended_on: ended, end_reason: reason }];
  });
  if (dropped) warn(`${dropped} relationship${dropped === 1 ? "" : "s"} pointed to people who are not in the file and were skipped.`);
  if (!persons.length) throw new ImportError("This backup has no usable people in it.");
  return { source: "nammoor-json", familyName: text(d.family?.name, 120), persons, parents, unions, warnings };
}
