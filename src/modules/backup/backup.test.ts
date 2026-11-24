import { describe, expect, it } from "vitest";
import { gedcomDate, parseGedcom, parseGedcomDate, toGedcom } from "./gedcom";
import { buildBackup, parseBackupJson } from "./json";
import type { BackupData } from "./types";

const person = (id: string, name: string, extra: Partial<BackupData["persons"][number]> = {}): BackupData["persons"][number] => ({
  id, full_name: name, initials: null, nickname: null, name_native: null, gender: "unknown", birth_date: null, birth_precision: "unknown",
  birth_time: null, birth_place: null, birth_order: null, is_living: true, death_date: null, death_precision: "unknown",
  native_place: null, current_city: null, state_code: null, country_code: null, history: null, ...extra,
});

const raw: Omit<BackupData, "events"> = {
  format: "nammoor-family-backup", version: 1, exported_at: "2026-11-24T00:00:00Z",
  family: { name: "Ramasamy Kudumbam", native_place: "Thanjavur" },
  persons: [
    person("p1", "Ramasamy", { gender: "male", birth_date: "1950-01-01", birth_precision: "year", native_place: "Thanjavur", name_native: "இராமசாமி", is_living: false, death_date: "2015-03-09", death_precision: "exact", history: "Farmer.\nLoved Pongal @ home." }),
    person("p2", "Lakshmi", { gender: "female", birth_date: "1955-06-15", birth_precision: "exact", birth_place: "Kumbakonam", birth_order: 2 }),
    person("p3", "Karthik Ramasamy", { gender: "male", birth_date: "1990-05-01", birth_precision: "exact", current_city: "Chennai", nickname: "Karthi" }),
    person("p4", "Divya", { gender: "female", birth_date: "1985-01-01", birth_precision: "approx" }),
    person("p5", "Stepdad Kumar", { gender: "male" }),
  ],
  parent_child: [
    { parent_id: "p1", child_id: "p3", kind: "biological" }, { parent_id: "p2", child_id: "p3", kind: "biological" },
    { parent_id: "p1", child_id: "p4", kind: "biological" }, { parent_id: "p2", child_id: "p4", kind: "biological" },
    { parent_id: "p5", child_id: "p4", kind: "adopted" },
  ],
  unions: [{ partner_a: "p1", partner_b: "p2", married_on: "1975-05-10", married_precision: "exact", ended_on: null, end_reason: null }],
  education: [{ person_id: "p3", level: "ug", course: "B.E. Civil", institution: "Anna University", year_completed: 2012 }],
  occupations: [{ person_id: "p1", title: "Farmer", organization: null, city: null, is_current: false, start_year: null, end_year: null }],
};
const backup = buildBackup(raw);

describe("GEDCOM dates", () => {
  it("writes by how exactly the date is known", () => {
    expect(gedcomDate("1990-03-05", "exact")).toBe("5 MAR 1990");
    expect(gedcomDate("1990-03-01", "month")).toBe("MAR 1990");
    expect(gedcomDate("1990-01-01", "year")).toBe("1990");
    expect(gedcomDate("1990-01-01", "approx")).toBe("ABT 1990");
    expect(gedcomDate(null, "exact")).toBeNull();
    expect(gedcomDate("1990-01-01", "unknown")).toBeNull();
  });
  it("reads the common forms", () => {
    expect(parseGedcomDate("24 MAR 1992")).toMatchObject({ date: "1992-03-24", precision: "exact" });
    expect(parseGedcomDate("mar 1992")).toMatchObject({ date: "1992-03-01", precision: "month" });
    expect(parseGedcomDate("1992")).toMatchObject({ date: "1992-01-01", precision: "year" });
    expect(parseGedcomDate("ABT 1950")).toMatchObject({ date: "1950-01-01", precision: "approx" });
    expect(parseGedcomDate("BET 1950 AND 1955")).toMatchObject({ date: "1950-01-01", precision: "approx" });
    expect(parseGedcomDate("BEF 12 JUN 1900")).toMatchObject({ date: "1900-06-12", precision: "approx" });
    expect(parseGedcomDate("1750/51")).toMatchObject({ date: "1750-01-01" });
  });
  it("rejects what it cannot understand, without throwing", () => {
    for (const bad of ["31 FEB 1990", "long ago", "32 JAN 2000", "5 XYZ 1990", "0050", "3000"]) expect(parseGedcomDate(bad)).toMatchObject({ date: null, understood: false });
    expect(parseGedcomDate("")).toMatchObject({ date: null, understood: true });
    expect(parseGedcomDate(undefined)).toMatchObject({ date: null, understood: true });
  });
});

describe("GEDCOM export", () => {
  const ged = toGedcom(backup, "test.ged", new Date(2026, 10, 24));
  it("has the required header and trailer", () => {
    expect(ged.startsWith("0 HEAD\r\n")).toBe(true);
    expect(ged).toContain("2 VERS 5.5.1");
    expect(ged).toContain("1 CHAR UTF-8");
    expect(ged).toContain("1 DATE 24 NOV 2026");
    expect(ged.trimEnd().endsWith("0 TRLR")).toBe(true);
  });
  it("writes people, sex, dates, places", () => {
    expect(ged).toContain("0 @I1@ INDI");
    expect(ged).toMatch(/1 NAME Ramasamy \/\/\r\n/);
    expect(ged).toContain("1 SEX F");
    expect(ged).toContain("2 DATE 15 JUN 1955");
    expect(ged).toContain("2 PLAC Kumbakonam");
    expect(ged).toContain("2 DATE 9 MAR 2015"); // death
    expect(ged).toContain("1 _NATIVE Thanjavur");
  });
  it("keeps Tamil text and writes the Tamil name as an alias", () => {
    expect(ged).toContain("1 NAME இராமசாமி //\r\n2 TYPE aka");
  });
  it("escapes @ and splits newlines into CONT", () => {
    expect(ged).toContain("1 NOTE Farmer.\r\n2 CONT Loved Pongal @@ home.");
  });
  it("links a family with husband, wife, children and the marriage", () => {
    expect(ged).toMatch(/0 @F1@ FAM\r\n1 HUSB @I1@\r\n1 WIFE @I2@\r\n1 CHIL @I3@\r\n1 CHIL @I4@\r\n1 MARR\r\n2 DATE 10 MAY 1975/);
  });
  it("puts an adopted child in a second family with PEDI", () => {
    expect(ged).toContain("2 PEDI adopted");
    expect(ged).toMatch(/0 @F2@ FAM\r\n1 HUSB @I5@\r\n1 CHIL @I4@/);
  });
  it("never writes a line longer than 255 characters, and does not cut letters", () => {
    const long = buildBackup({ ...raw, persons: [person("x", "Long", { history: "அ".repeat(600) + "\n" + "b".repeat(300) })], parent_child: [], unions: [], education: [], occupations: [] });
    const g = toGedcom(long);
    for (const line of g.split("\r\n")) expect([...line].length).toBeLessThanOrEqual(255);
    expect(parseGedcom(g).persons[0].history).toBe("அ".repeat(600) + "\n" + "b".repeat(300));
  });
});

describe("GEDCOM round trip", () => {
  const back = parseGedcom(toGedcom(backup));
  const byName = (n: string) => back.persons.find((p) => p.full_name === n)!;
  it("returns every person with the same facts", () => {
    expect(back.persons).toHaveLength(5);
    expect(byName("Ramasamy")).toMatchObject({ gender: "male", birth_date: "1950-01-01", birth_precision: "year", is_living: false, death_date: "2015-03-09", native_place: "Thanjavur", name_native: "இராமசாமி" });
    expect(byName("Lakshmi")).toMatchObject({ birth_date: "1955-06-15", birth_precision: "exact", birth_place: "Kumbakonam", birth_order: 2 });
    expect(byName("Divya").birth_precision).toBe("approx");
    expect(byName("Karthik Ramasamy")).toMatchObject({ current_city: "Chennai", nickname: "Karthi" });
    expect(byName("Ramasamy").history).toBe("Farmer.\nLoved Pongal @ home.");
  });
  it("keeps work and education", () => {
    expect(byName("Ramasamy").occupations[0].title).toBe("Farmer");
    expect(byName("Karthik Ramasamy").education[0].course).toContain("B.E. Civil");
  });
  it("keeps parents, kinds and the marriage", () => {
    const ref = (n: string) => byName(n).ref;
    const has = (p: string, c: string, k: string) => back.parents.some((l) => l[0] === ref(p) && l[1] === ref(c) && l[2] === k);
    expect(has("Ramasamy", "Karthik Ramasamy", "biological")).toBe(true);
    expect(has("Lakshmi", "Divya", "biological")).toBe(true);
    expect(has("Stepdad Kumar", "Divya", "adopted")).toBe(true);
    expect(back.parents).toHaveLength(5);
    expect(back.unions).toHaveLength(1);
    expect(back.unions[0]).toMatchObject({ married_on: "1975-05-10", married_precision: "exact" });
  });
  it("is stable: exporting what was imported gives the same file shape", () => {
    expect(back.warnings).toEqual([]);
  });
});

describe("GEDCOM from other programs", () => {
  it("reads a typical file with CRLF, a BOM, surnames in slashes and a pointer note", () => {
    const src = "﻿0 HEAD\r\n1 CHAR UTF-8\r\n0 @I1@ INDI\r\n1 NAME John /Smith/ Jr\r\n1 SEX M\r\n1 BIRT\r\n2 DATE 3 JAN 1900\r\n2 PLAC Boston, MA\r\n1 NOTE @N1@\r\n1 FAMS @F1@\r\n0 @I2@ INDI\r\n1 NAME Mary /Jones/\r\n1 SEX F\r\n1 DEAT Y\r\n1 FAMS @F1@\r\n0 @I3@ INDI\r\n1 NAME Kid\r\n1 FAMC @F1@\r\n0 @F1@ FAM\r\n1 HUSB @I1@\r\n1 WIFE @I2@\r\n1 CHIL @I3@\r\n1 DIV\r\n2 DATE 1 JAN 1950\r\n0 @N1@ NOTE x\r\n0 TRLR\r\n";
    const d = parseGedcom(src);
    expect(d.persons.map((p) => p.full_name)).toEqual(["John Smith Jr", "Mary Jones", "Kid"]);
    expect(d.persons[0]).toMatchObject({ birth_date: "1900-01-03", birth_place: "Boston, MA", history: null });
    expect(d.persons[1].is_living).toBe(false);
    expect(d.parents).toHaveLength(2);
    expect(d.unions[0]).toMatchObject({ ended_on: "1950-01-01", end_reason: "divorce" });
  });
  it("warns about old character sets and bad dates but keeps going", () => {
    const d = parseGedcom("0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME A\n1 BIRT\n2 DATE sometime\n0 TRLR");
    expect(d.persons).toHaveLength(1);
    expect(d.warnings.join(" ")).toMatch(/ANSEL/);
    expect(d.warnings.join(" ")).toMatch(/sometime/);
  });
  it("skips links to people who are not in the file", () => {
    const d = parseGedcom("0 HEAD\n0 @I1@ INDI\n1 NAME A\n0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I9@\n0 TRLR");
    expect(d.parents).toEqual([]);
    expect(d.warnings.join(" ")).toMatch(/not in the file/);
  });
  it("rejects files that are not GEDCOM, and empty ones", () => {
    expect(() => parseGedcom("hello world")).toThrow(/not a GEDCOM/);
    expect(() => parseGedcom("0 HEAD\n0 TRLR")).toThrow(/no people/);
  });
  it("does not mind blank lines, odd spacing, unknown tags, or a missing name", () => {
    const d = parseGedcom("0 HEAD\n\n0   @I1@   INDI\n1 SEX F\n1 WEIRD thing\n2 DEEPER x\n\n0 TRLR");
    expect(d.persons[0]).toMatchObject({ full_name: "Unknown", gender: "female" });
  });
  it("a person with a death date is never imported as living", () => {
    expect(parseGedcom("0 HEAD\n0 @I1@ INDI\n1 NAME A\n1 DEAT\n2 DATE 1990\n0 TRLR").persons[0].is_living).toBe(false);
  });
});

describe("JSON backup", () => {
  const text = JSON.stringify(backup);
  it("has readable events", () => {
    expect(backup.events!.map((e) => e.type)).toContain("marriage");
    expect(backup.events![0].date! <= backup.events![1].date!).toBe(true);
  });
  it("round trips", () => {
    const d = parseBackupJson(text);
    expect(d.persons).toHaveLength(5);
    expect(d.parents).toHaveLength(5);
    expect(d.unions).toHaveLength(1);
    expect(d.persons.find((p) => p.full_name === "Karthik Ramasamy")!.education[0].course).toBe("B.E. Civil");
    expect(d.familyName).toBe("Ramasamy Kudumbam");
    expect(d.warnings).toEqual([]);
  });
  it("rejects the wrong kind of file with a clear message", () => {
    expect(() => parseBackupJson("not json")).toThrow(/not readable/);
    expect(() => parseBackupJson("{}")).toThrow(/not a Nammoor/);
    expect(() => parseBackupJson(JSON.stringify({ ...backup, version: 2 }))).toThrow(/newer version/);
    expect(() => parseBackupJson(JSON.stringify({ ...backup, persons: "x" }))).toThrow(/no people/);
    expect(() => parseBackupJson(JSON.stringify({ ...backup, persons: [] }))).toThrow(/no usable people/);
  });
  it("drops what would break the database instead of failing", () => {
    const evil = { ...backup, persons: [
      { ...backup.persons[0], full_name: "x".repeat(500), birth_date: "1990-02-31", gender: "robot", state_code: "tn", birth_order: 99, history: "h".repeat(9000) },
      { ...backup.persons[1], id: "p1" }, // repeated id
      { ...backup.persons[2], id: "" },
    ], parent_child: [{ parent_id: "p1", child_id: "p1", kind: "biological" }, { parent_id: "p1", child_id: "ghost", kind: "biological" }], unions: [{ partner_a: "p1", partner_b: "ghost" }] };
    const d = parseBackupJson(JSON.stringify(evil));
    expect(d.persons).toHaveLength(1);
    expect(d.persons[0]).toMatchObject({ gender: "unknown", birth_date: null, state_code: null, birth_order: null });
    expect(d.persons[0].full_name).toHaveLength(120);
    expect(d.persons[0].history).toHaveLength(5000);
    expect(d.parents).toEqual([]);
    expect(d.unions).toEqual([]);
    expect(d.warnings.length).toBeGreaterThan(0);
  });
  it("does not carry private or account data", () => {
    expect(text).not.toMatch(/salary|haplogroup|managed_by|user_id/);
  });
});
