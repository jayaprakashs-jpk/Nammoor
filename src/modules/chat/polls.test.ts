import { describe, expect, it } from "vitest";
import { cleanOptions, closesLabel, isOpen, percents, pollProblem, totalVotes, withMyVote, type PollOption } from "./polls";

const o = (id: string, votes: number): PollOption => ({ id, poll_id: "p", label: id, position: 1, votes });

describe("percents", () => {
  it("is all zero with no votes", () => expect(percents([o("a", 0), o("b", 0)])).toEqual([0, 0]));
  it("always adds up to 100", () => {
    for (const v of [[1, 1, 1], [1, 2], [3, 3, 3, 1], [7, 1, 1, 1, 1], [1, 0, 0]]) {
      const p = percents(v.map((n, i) => o(String(i), n)));
      expect(p.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
  it("splits thirds as 34/33/33", () => expect(percents([o("a", 1), o("b", 1), o("c", 1)])).toEqual([34, 33, 33]));
  it("ignores a bad negative count", () => expect(totalVotes([o("a", -3), o("b", 2)])).toBe(2));
});

describe("cleanOptions / pollProblem", () => {
  it("trims, drops blanks and repeats, keeps order and first spelling", () =>
    expect(cleanOptions([" Yes ", "yes", "", "No", "  ", "YES", "Maybe"])).toEqual(["Yes", "No", "Maybe"]));
  it("needs a question", () => expect(pollProblem("  ", ["a", "b"])).toMatch(/question/));
  it("needs 2 different choices", () => {
    expect(pollProblem("Q", ["a"])).toMatch(/2/);
    expect(pollProblem("Q", ["a", "A"])).toMatch(/2/);
    expect(pollProblem("Q", ["a", "b"])).toBeNull();
  });
  it("allows at most 5", () => {
    expect(pollProblem("Q", ["a", "b", "c", "d", "e"])).toBeNull();
    expect(pollProblem("Q", ["a", "b", "c", "d", "e", "f"])).toMatch(/5/);
  });
  it("limits lengths", () => {
    expect(pollProblem("q".repeat(201), ["a", "b"])).toMatch(/200/);
    expect(pollProblem("Q", ["a", "b".repeat(81)])).toMatch(/80/);
  });
});

describe("open / closed", () => {
  const now = Date.parse("2026-11-25T10:00:00Z");
  it("closed_at wins", () => expect(isOpen({ closes_at: null, closed_at: "2026-11-25T09:00:00Z" }, now)).toBe(false));
  it("a passed closing time means closed", () => expect(isOpen({ closes_at: "2026-11-25T09:59:00Z", closed_at: null }, now)).toBe(false));
  it("no end time means open", () => expect(isOpen({ closes_at: null, closed_at: null }, now)).toBe(true));
  it("labels", () => {
    expect(closesLabel({ closes_at: null, closed_at: null }, now)).toBe("Open");
    expect(closesLabel({ closes_at: "2026-11-25T13:00:00Z", closed_at: null }, now)).toBe("Closes in 3 hours");
    expect(closesLabel({ closes_at: "2026-11-30T10:00:00Z", closed_at: null }, now)).toBe("Closes in 5 days");
    expect(closesLabel({ closes_at: null, closed_at: "x" }, now)).toBe("Closed");
  });
});

describe("withMyVote", () => {
  it("moves my vote from one choice to another", () => {
    const r = withMyVote([o("a", 2), o("b", 0)], "a", "b");
    expect(r.map((x) => x.votes)).toEqual([1, 1]);
  });
  it("a first vote adds one", () => expect(withMyVote([o("a", 0), o("b", 0)], null, "a").map((x) => x.votes)).toEqual([1, 0]));
  it("tapping the same choice changes nothing", () => expect(withMyVote([o("a", 1)], "a", "a")[0].votes).toBe(1));
});
