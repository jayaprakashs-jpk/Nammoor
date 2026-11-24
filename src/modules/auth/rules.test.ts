import { describe, expect, it } from "vitest";
import { authError } from "@/shared/lib/errors";
import { COUNTRIES, identityKey, looksLikePhone, parseIdentifier, prettyPhone } from "./identifier";
import { clearFails, failAllowance, otpAllowance, OTP_LIMIT, recordFail, recordOtp, resendWait, waitText, type Store } from "./limits";
import { firstProblem, isStrong, passwordRules } from "./password";

const IN = COUNTRIES[0];
const phone = (raw: string, c = IN) => parseIdentifier(raw, c);

describe("email or mobile in one box", () => {
  it("emails: trims, lower-cases, checks shape", () => {
    expect(parseIdentifier("  Ravi.Kumar@Gmail.COM ")).toEqual({ kind: "email", email: "ravi.kumar@gmail.com" });
    for (const bad of ["ravi@", "ravi@gmail", "@gmail.com", "ravi gmail.com@", "a@b.c"]) expect(parseIdentifier(bad).kind).toBe("invalid");
  });
  it("Indian numbers in every way people write them", () => {
    for (const raw of ["9876543210", "98765 43210", "098765 43210", "91 98765 43210", "+91 98765-43210", "(98765) 43210", "0091 9876543210", "+919876543210"])
      expect(phone(raw), raw).toMatchObject({ kind: "phone", e164: "+919876543210" });
  });
  it("rejects wrong Indian numbers with a clear reason", () => {
    expect(phone("12345 67890")).toMatchObject({ kind: "invalid", message: expect.stringMatching(/starts with 6, 7, 8 or 9/) });
    expect(phone("98765")).toMatchObject({ kind: "invalid", message: expect.stringMatching(/10 digits/) });
    expect(phone("98765432101234")).toMatchObject({ kind: "invalid" });
  });
  it("other countries by selector or by +code", () => {
    expect(phone("0412 345 678", COUNTRIES.find((c) => c.code === "61")!)).toMatchObject({ e164: "+61412345678" });
    expect(phone("+971 50 123 4567")).toMatchObject({ kind: "phone", e164: "+971501234567" });
    expect(phone("+1 415 555 2671")).toMatchObject({ e164: "+14155552671" });
    expect(phone("+999 123456789").kind).toBe("invalid");
  });
  it("never lets letters or symbols through as a phone", () => {
    expect(phone("98765abc10").kind).toBe("invalid");
    expect(phone("9876543210; drop table").kind).toBe("invalid");
    expect(parseIdentifier("   ").kind).toBe("empty");
  });
  it("knows when to show the country picker", () => {
    expect(looksLikePhone("98765")).toBe(true);
    expect(looksLikePhone("+91 9")).toBe(true);
    expect(looksLikePhone("ravi")).toBe(false);
    expect(looksLikePhone("ravi@x.com")).toBe(false);
  });
  it("one number typed differently is one key", () => {
    expect(identityKey(phone("98765 43210"))).toBe(identityKey(phone("+91 9876543210")));
    expect(identityKey(parseIdentifier("A@B.in"))).toBe(identityKey(parseIdentifier("a@b.in")));
    expect(identityKey({ kind: "empty" })).toBeNull();
  });
  it("shows numbers back nicely", () => expect(prettyPhone("+919876543210")).toBe("+91 98765 43210"));
});

describe("password rules", () => {
  it("accepts 8+ with a letter and a number", () => expect(isStrong("Pongal2026")).toBe(true));
  it("each rule is reported on its own", () => {
    const by = (pw: string) => Object.fromEntries(passwordRules(pw).map((r) => [r.id, r.ok]));
    expect(by("abc")).toEqual({ length: false, letter: true, number: false, easy: true });
    expect(by("12345678")).toMatchObject({ length: true, letter: false, number: true, easy: false });
    expect(by("abcdefgh")).toMatchObject({ length: true, letter: true, number: false });
    expect(by("")).toMatchObject({ easy: false });
  });
  it("Tamil letters count as letters", () => expect(passwordRules("அம்மா12345")[1].ok).toBe(true));
  it("blocks easy ones and your own email name", () => {
    expect(isStrong("Password123")).toBe(false); // too common, even with a capital
    expect(isStrong("password123")).toBe(false);
    expect(isStrong("aaaaaaaa1")).toBe(true);
    expect(isStrong("11111111")).toBe(false);
    expect(isStrong("ravikumar99", "ravikumar@gmail.com")).toBe(false);
    expect(isStrong("ravikumar99", "other@gmail.com")).toBe(true);
  });
  it("tells the first thing to fix", () => {
    expect(firstProblem("abc")).toBe("At least 8 characters");
    expect(firstProblem("abcdefgh")).toBe("At least one number");
    expect(firstProblem("Pongal2026")).toBeNull();
  });
});

const memory = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void (v === null ? data.delete(k) : data.set(k, v)) };
};
const T0 = 1_000_000_000_000;
const min = (n: number) => n * 60_000;

describe("code request limits (on this phone)", () => {
  it("allows 3 per number in 15 minutes, then stops and says how long", () => {
    const s = memory();
    for (let i = 0; i < 3; i++) {
      expect(otpAllowance(s, "p:+919876543210", T0 + i * 1000).allowed).toBe(true);
      recordOtp(s, "p:+919876543210", T0 + i * 1000);
    }
    const a = otpAllowance(s, "p:+919876543210", T0 + 5000);
    expect(a).toMatchObject({ allowed: false, reason: "target" });
    expect(a.retryInMs).toBeGreaterThan(min(14));
    expect(a.retryInMs).toBeLessThanOrEqual(min(15));
  });
  it("frees up when the oldest request leaves the 15 minute window", () => {
    const s = memory();
    for (let i = 0; i < 3; i++) recordOtp(s, "e:a@b.in", T0 + i * min(1));
    expect(otpAllowance(s, "e:a@b.in", T0 + min(10)).allowed).toBe(false);
    expect(otpAllowance(s, "e:a@b.in", T0 + min(15) + 100).allowed).toBe(true); // first one expired
  });
  it("a different number is not blocked, but the device has its own cap of 5", () => {
    const s = memory();
    for (let i = 0; i < 3; i++) recordOtp(s, "p:+911", T0);
    expect(otpAllowance(s, "p:+912", T0).allowed).toBe(true);
    recordOtp(s, "p:+912", T0);
    recordOtp(s, "p:+912", T0);
    const a = otpAllowance(s, "p:+913", T0 + 10);
    expect(a).toMatchObject({ allowed: false, reason: "device" });
  });
  it("resend button waits 30 seconds", () => {
    const s = memory();
    recordOtp(s, "e:x@y.in", T0);
    expect(resendWait(s, "e:x@y.in", T0 + 5000)).toBe(25);
    expect(resendWait(s, "e:x@y.in", T0 + 31_000)).toBe(0);
    expect(resendWait(s, "e:other@y.in", T0)).toBe(0);
  });
  it("survives broken or hostile stored data", () => {
    const s = memory();
    s.set("nammoor.otp.device", "not json");
    s.set("nammoor.otp.e:q@q.in", JSON.stringify(["x", null, { a: 1 }, T0 + 10 * 365 * 86400_000]));
    expect(otpAllowance(s, "e:q@q.in", T0).allowed).toBe(true); // a far-future time can't lock you out forever
  });
  it("limits match the spec", () => expect(OTP_LIMIT).toMatchObject({ perTarget: 3, windowMs: min(15) }));
});

describe("wrong code / password lockout", () => {
  it("locks after 5 wrong tries, counting down what is left", () => {
    const s = memory();
    expect(recordFail(s, "e:a@b.in", T0).left).toBe(4);
    expect(recordFail(s, "e:a@b.in", T0 + 1000).left).toBe(3);
    for (let i = 0; i < 3; i++) recordFail(s, "e:a@b.in", T0 + 2000 + i);
    const a = failAllowance(s, "e:a@b.in", T0 + 6000);
    expect(a.allowed).toBe(false);
    expect(a.retryInMs).toBeGreaterThan(min(14));
  });
  it("a correct sign in clears the count; the lock also ends by itself", () => {
    const s = memory();
    for (let i = 0; i < 5; i++) recordFail(s, "k", T0);
    expect(failAllowance(s, "k", T0 + min(16)).allowed).toBe(true);
    clearFails(s, "k");
    expect(failAllowance(s, "k", T0 + 1).allowed).toBe(true);
  });
  it("words", () => {
    expect(waitText(30_000)).toBe("30 seconds");
    expect(waitText(1000)).toBe("1 second");
    expect(waitText(min(12) - 5)).toBe("12 minutes");
    expect(waitText(min(1) + 1)).toBe("2 minutes");
  });
});

describe("clear error messages", () => {
  it.each([
    [{ code: "invalid_credentials", message: "Invalid login credentials" }, /Wrong email or password/],
    [{ message: "Token has expired or is invalid" }, /wrong or has expired/],
    [{ code: "otp_expired", message: "x" }, /wrong or has expired/],
    [{ code: "weak_password", message: "Password should contain..." }, /too easy/],
    [{ code: "over_sms_send_rate_limit", message: "x" }, /Too many tries/],
    [{ code: "phone_provider_disabled", message: "Unsupported phone provider" }, /not switched on yet/],
    [{ code: "sms_send_failed", message: "x" }, /could not send an SMS/],
    [{ code: "identity_already_exists", message: "x" }, /already used by another Nammoor account/],
    [{ code: "same_password", message: "New password should be different from the old password." }, /not used before/],
    [{ code: "email_not_confirmed", message: "Email not confirmed" }, /not confirmed/],
    [{ code: "user_already_exists", message: "User already registered" }, /already exists/],
  ])("%j", (e, re) => expect(authError(e)).toMatch(re));
  it("never reveals whether the email or the password was wrong", () => {
    expect(authError({ code: "invalid_credentials", message: "x" })).not.toMatch(/no account|user not found|email is wrong|password is wrong/i);
  });
});
