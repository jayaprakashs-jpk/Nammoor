import { describe, expect, it } from "vitest";
import { lines, matches } from "./api";

describe("recipes helpers", () => {
  const r = { title: "Chicken Chettinad", title_native: "செட்டிநாடு சிக்கன்", ingredients: "1 kg chicken\n- 2 tsp pepper" };
  it("finds by English name, Tamil name and ingredient", () => {
    expect(matches(r, "chettinad")).toBe(true);
    expect(matches(r, "சிக்கன்")).toBe(true);
    expect(matches(r, "PEPPER")).toBe(true);
    expect(matches(r, "payasam")).toBe(false);
    expect(matches(r, "  ")).toBe(true);
  });
  it("splits ingredient lines and drops bullets and blanks", () => {
    expect(lines("- rice\n\n• dal \n* salt\r\nghee")).toEqual(["rice", "dal", "salt", "ghee"]);
  });
});
