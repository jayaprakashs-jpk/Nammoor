import { describe, expect, it } from "vitest";
import { classifyBiometricError, GRACE_MS, shouldLock } from "./appLock";

describe("when the app locks", () => {
  it("never when the lock is off", () => {
    expect(shouldLock(false, null)).toBe(false);
    expect(shouldLock(false, 10 * GRACE_MS)).toBe(false);
  });
  it("always on a fresh start", () => expect(shouldLock(true, null)).toBe(true));
  it("not for a short trip to the file picker, Share sheet or Google tab", () => {
    expect(shouldLock(true, 2_000)).toBe(false);
    expect(shouldLock(true, GRACE_MS - 1)).toBe(false);
  });
  it("after being away for 30 seconds or more", () => {
    expect(shouldLock(true, GRACE_MS)).toBe(true);
    expect(shouldLock(true, 10 * 60_000)).toBe(true);
  });
});

describe("reading what the phone said", () => {
  it.each([[16, "cancelled"], [11, "cancelled"], [15, "cancelled"], [2, "locked_out"], [4, "locked_out"], [3, "not_set_up"], [14, "not_set_up"], [1, "not_set_up"], [10, "failed"], [0, "failed"]])(
    "code %i is %s", (code, want) => expect(classifyBiometricError({ code })).toBe(want),
  );
  it("copes with strange errors", () => {
    expect(classifyBiometricError(new Error("boom"))).toBe("failed");
    expect(classifyBiometricError(null)).toBe("failed");
    expect(classifyBiometricError({ code: "16" })).toBe("cancelled");
  });
});
