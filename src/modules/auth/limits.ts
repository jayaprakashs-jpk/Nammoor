// Soft limits kept on this phone: how many codes were asked for, how many wrong tries.
// These stop honest mistakes and casual abuse. The real limits live on the server.

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

export const OTP_LIMIT = { perTarget: 3, perDevice: 5, windowMs: 15 * 60_000 };
export const FAIL_LIMIT = { max: 5, windowMs: 15 * 60_000 };
export const RESEND_WAIT_MS = 30_000;

const read = (s: Store, k: string): number[] => {
  try {
    const v = JSON.parse(s.get(k) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
};
const recent = (s: Store, k: string, windowMs: number, now: number) => read(s, k).filter((t) => now - t < windowMs && t <= now + 60_000);

export interface Allowance {
  allowed: boolean;
  /** Milliseconds until the next try is allowed. 0 when allowed. */
  retryInMs: number;
  /** Which limit stopped it. */
  reason?: "target" | "device";
}

export function otpAllowance(s: Store, target: string, now = Date.now()): Allowance {
  const t = recent(s, `nammoor.otp.${target}`, OTP_LIMIT.windowMs, now);
  const d = recent(s, "nammoor.otp.device", OTP_LIMIT.windowMs, now);
  const waits: { ms: number; reason: "target" | "device" }[] = [];
  if (t.length >= OTP_LIMIT.perTarget) waits.push({ ms: OTP_LIMIT.windowMs - (now - t[t.length - OTP_LIMIT.perTarget]), reason: "target" });
  if (d.length >= OTP_LIMIT.perDevice) waits.push({ ms: OTP_LIMIT.windowMs - (now - d[d.length - OTP_LIMIT.perDevice]), reason: "device" });
  if (!waits.length) return { allowed: true, retryInMs: 0 };
  const w = waits.sort((a, b) => b.ms - a.ms)[0];
  return { allowed: false, retryInMs: Math.max(1000, w.ms), reason: w.reason };
}

export function recordOtp(s: Store, target: string, now = Date.now()) {
  for (const k of [`nammoor.otp.${target}`, "nammoor.otp.device"]) s.set(k, JSON.stringify([...recent(s, k, OTP_LIMIT.windowMs, now), now].slice(-20)));
}

/** Seconds until the Resend button works again. */
export function resendWait(s: Store, target: string, now = Date.now()): number {
  const t = recent(s, `nammoor.otp.${target}`, OTP_LIMIT.windowMs, now);
  const last = t[t.length - 1];
  return last ? Math.max(0, Math.ceil((RESEND_WAIT_MS - (now - last)) / 1000)) : 0;
}

export function failAllowance(s: Store, target: string, now = Date.now()): Allowance {
  const f = recent(s, `nammoor.fail.${target}`, FAIL_LIMIT.windowMs, now);
  if (f.length < FAIL_LIMIT.max) return { allowed: true, retryInMs: 0 };
  return { allowed: false, retryInMs: Math.max(1000, FAIL_LIMIT.windowMs - (now - f[f.length - FAIL_LIMIT.max])), reason: "target" };
}

export function recordFail(s: Store, target: string, now = Date.now()): { left: number } {
  const k = `nammoor.fail.${target}`;
  const f = [...recent(s, k, FAIL_LIMIT.windowMs, now), now];
  s.set(k, JSON.stringify(f.slice(-20)));
  return { left: Math.max(0, FAIL_LIMIT.max - f.length) };
}

export const clearFails = (s: Store, target: string) => s.set(`nammoor.fail.${target}`, null);

/** "12 minutes", "45 seconds". Whole words, rounded up. */
export function waitText(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.ceil(s / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}
