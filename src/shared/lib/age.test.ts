import { describe, expect, it } from "vitest";
import { ageFrom, formatAge, formatDate } from "./age";

const today = new Date(2026, 10, 24); // 24 Nov 2026

describe("ageFrom", () => {
  it("exact DOB, birthday not yet this year", () => {
    expect(ageFrom("1990-12-01", "exact", { today })).toEqual({ years: 35, approx: false });
  });
  it("exact DOB, birthday today", () => {
    expect(ageFrom("1990-11-24", "exact", { today })).toEqual({ years: 36, approx: false });
  });
  it("leap day baby", () => {
    expect(ageFrom("2000-02-29", "exact", { today: new Date(2026, 1, 28) })?.years).toBe(25);
    expect(ageFrom("2000-02-29", "exact", { today: new Date(2026, 2, 1) })?.years).toBe(26);
  });
  it("only year known is approximate", () => {
    expect(ageFrom("1950-01-01", "year", { today })).toEqual({ years: 76, approx: true });
  });
  it("month precision", () => {
    expect(ageFrom("1990-12-01", "month", { today })?.years).toBe(35);
    expect(ageFrom("1990-11-01", "month", { today })?.years).toBe(36);
  });
  it("age at death", () => {
    expect(ageFrom("1930-06-10", "exact", { deathDate: "2010-06-09", today })?.years).toBe(79);
  });
  it("unknown or missing DOB", () => {
    expect(ageFrom(null, "exact", { today })).toBeNull();
    expect(ageFrom("1990-01-01", "unknown", { today })).toBeNull();
  });
  it("future DOB is rejected", () => {
    expect(ageFrom("2030-01-01", "exact", { today })).toBeNull();
  });
});

describe("format", () => {
  it("formats age", () => {
    expect(formatAge({ years: 70, approx: true }, true)).toBe("~70 yrs");
    expect(formatAge({ years: 80, approx: false }, false)).toBe("died at 80");
    expect(formatAge(null, true)).toBe("");
  });
  it("formats dates by precision", () => {
    expect(formatDate("1950-01-01", "year")).toBe("1950");
    expect(formatDate("1950-01-01", "approx")).toBe("around 1950");
    expect(formatDate("1950-01-01", "unknown")).toBe("");
  });
});
