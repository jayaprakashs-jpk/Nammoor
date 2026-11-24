import { isNativeApp } from "./platform";
import { readLocal, writeLocal } from "./storage";

// App Lock: ask for fingerprint, face or the phone's PIN when the app opens or comes back
// after being away. It keeps curious people out of an unlocked phone's family tree.
// It is a convenience lock, not a vault: the real protection is the phone's own screen lock.

const KEY = "nammoor.appLock"; // per phone, on purpose: not stored in the account
export const LOCK_EVENT = "nammoor:lock-changed";
/** Leaving the app for less than this (file picker, Share sheet, Google tab) does not lock it. */
export const GRACE_MS = 30_000;

export const lockEnabled = () => readLocal(KEY) === "1";

export function setLockEnabled(on: boolean) {
  writeLocal(KEY, on ? "1" : null);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCK_EVENT));
}

/** Signing out also forgets the lock, so the next person on this phone starts clean. */
export const clearLock = () => setLockEnabled(false);

/** Should the lock screen show? awayMs is how long the app was in the background (null = fresh start). */
export function shouldLock(enabled: boolean, awayMs: number | null, graceMs = GRACE_MS): boolean {
  if (!enabled) return false;
  if (awayMs === null) return true; // cold start
  return awayMs >= graceMs;
}

// numbers from @capgo/capacitor-native-biometric (BiometricAuthError)
const CANCELLED = new Set([11, 15, 16, 17]);
const LOCKED_OUT = new Set([2, 4]);
const NOT_SET_UP = new Set([1, 3, 14]);

export type AuthOutcome = "ok" | "cancelled" | "locked_out" | "not_set_up" | "failed";

export function classifyBiometricError(e: unknown): AuthOutcome {
  const code = typeof e === "object" && e && "code" in e ? Number((e as { code: unknown }).code) : NaN;
  if (CANCELLED.has(code)) return "cancelled";
  if (LOCKED_OUT.has(code)) return "locked_out";
  if (NOT_SET_UP.has(code)) return "not_set_up";
  return "failed";
}

export const outcomeMessage: Record<Exclude<AuthOutcome, "ok">, string> = {
  cancelled: "",
  failed: "That did not work. Please try again.",
  locked_out: "Too many wrong tries. Wait a little, or use your phone PIN.",
  not_set_up: "First set up a screen lock (PIN, pattern, fingerprint or face) in your phone Settings.",
};

export const lockSupported = () => isNativeApp();

/** Show the phone's own unlock sheet. Fingerprint, face, or the phone PIN. */
export async function authenticate(reason = "Unlock Nammoor"): Promise<AuthOutcome> {
  if (!isNativeApp()) return "failed";
  const { NativeBiometric, BiometryType } = await import("@capgo/capacitor-native-biometric");
  try {
    const a = await NativeBiometric.isAvailable({ useFallback: true });
    if (!a.isAvailable) return "not_set_up";
  } catch {
    return "not_set_up";
  }
  const ask = (withPin: boolean) =>
    NativeBiometric.verifyIdentity({
      reason, title: reason, subtitle: "Use your fingerprint, face or phone PIN", useFallback: true, maxAttempts: 3,
      ...(withPin ? { allowedBiometryTypes: [BiometryType.FINGERPRINT, BiometryType.FACE_AUTHENTICATION, BiometryType.DEVICE_CREDENTIAL] } : {}),
    });
  try {
    await ask(true); // biometrics, with the phone PIN as the way out for people whose fingerprint fails
    return "ok";
  } catch (e) {
    const first = classifyBiometricError(e);
    if (first !== "failed") return first;
    try {
      await ask(false); // some older phones cannot mix biometrics and PIN: plain biometrics then
      return "ok";
    } catch (e2) {
      return classifyBiometricError(e2);
    }
  }
}
