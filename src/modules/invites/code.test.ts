import { describe, expect, it } from "vitest";
import { extractCode, prettyCode, shareMessage } from "./code";

describe("extractCode", () => {
  it("takes a bare code in any style", () => {
    expect(extractCode("K7MQ4XPA")).toBe("K7MQ4XPA");
    expect(extractCode("k7mq-4xpa")).toBe("K7MQ4XPA");
    expect(extractCode("  K7MQ 4XPA ")).toBe("K7MQ4XPA");
  });
  it("finds the code in a pasted WhatsApp message", () => {
    const msg = shareMessage("Ramasamy Kudumbam", "K7MQ4XPA", "https://x.app/invite/?t=K7MQ4XPA", 48);
    expect(extractCode(msg)).toBe("K7MQ4XPA");
    expect(extractCode(msg.replace(/Open:.*\n/, ""))).toBe("K7MQ4XPA");
  });
  it("reads a link", () => expect(extractCode("https://x.app/invite/?t=k7mq-4xpa")).toBe("K7MQ4XPA"));
  it("never treats an ordinary word as a code", () => {
    expect(extractCode("Please join RELATIVES today")).toBeNull();
    expect(extractCode("FAMILYTREE")).toBeNull();
  });
  it("rejects letters that are not in the alphabet (I and O) and wrong length", () => {
    expect(extractCode("K7MQ4XPI")).toBeNull();
    expect(extractCode("K7MQ4XP")).toBeNull();
    expect(extractCode("K7MQ4XPAA")).toBeNull();
    expect(extractCode("")).toBeNull();
  });
  it("pretty prints", () => expect(prettyCode("K7MQ4XPA")).toBe("K7MQ-4XPA"));
});
