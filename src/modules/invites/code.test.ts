import { describe, expect, it } from "vitest";
import { extractCode, shareMessage } from "./code";

const CODE = "a".repeat(24) + "0123456789abcdef01234567";

describe("extractCode", () => {
  it("takes a bare code", () => expect(extractCode(CODE)).toBe(CODE));
  it("finds the code in a pasted WhatsApp message", () => {
    expect(extractCode(shareMessage("Ramasamy", CODE, "https://x.app/invite/?t=" + CODE, 7))).toBe(CODE);
  });
  it("handles upper case and spaces", () => expect(extractCode(`  ${CODE.toUpperCase()} `)).toBe(CODE));
  it("rejects short or long hex", () => {
    expect(extractCode(CODE.slice(1))).toBeNull();
    expect(extractCode(CODE + "a")).toBeNull();
  });
  it("rejects junk", () => expect(extractCode("hello")).toBeNull());
});
