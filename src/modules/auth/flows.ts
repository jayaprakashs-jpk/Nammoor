import { sb } from "@/shared/lib/supabase";
import { authError } from "@/shared/lib/errors";
import { readLocal, writeLocal } from "@/shared/lib/storage";
import { identityKey, prettyPhone, type Parsed } from "./identifier";
import { clearFails, failAllowance, otpAllowance, recordFail, recordOtp, waitText, type Store } from "./limits";
import { firstProblem } from "./password";

// Every sign-in call goes through here, so the limits and the error words are the same everywhere.

export const store: Store = { get: readLocal, set: writeLocal };

export type Target = Extract<Parsed, { kind: "email" | "phone" }>;
export type Result = { ok: true } | { ok: false; message: string };
const fail = (message: string): Result => ({ ok: false, message });

export const targetKey = (t: Target) => identityKey(t)!;
export const targetLabel = (t: Target) => (t.kind === "email" ? t.email : prettyPhone(t.e164));

function blocked(key: string, now = Date.now()): string | null {
  const a = otpAllowance(store, key, now);
  return a.allowed ? null : a.reason === "device" ? `Too many codes were asked for on this phone. Please wait ${waitText(a.retryInMs)}.` : `You already asked for 3 codes. Please wait ${waitText(a.retryInMs)} before asking again.`;
}

/** Send a 6-digit code by SMS or email. Counts toward the 3 per 15 minutes limit. */
export async function sendCode(t: Target): Promise<Result> {
  const key = targetKey(t);
  const stop = blocked(key);
  if (stop) return fail(stop);
  recordOtp(store, key); // counted even if it fails, so retrying a broken number can't loop
  const { error } = await sb().auth.signInWithOtp(t.kind === "email" ? { email: t.email, options: { shouldCreateUser: true } } : { phone: t.e164, options: { shouldCreateUser: true, channel: "sms" } });
  return error ? fail(authError(error)) : { ok: true };
}

/** Check wrong-attempt lockout, run the check, count mistakes. */
async function guarded(key: string, run: () => Promise<{ error: unknown }>): Promise<Result> {
  const a = failAllowance(store, key);
  if (!a.allowed) return fail(`Too many wrong tries. Please wait ${waitText(a.retryInMs)}, or use another way to sign in.`);
  const { error } = await run();
  if (!error) {
    clearFails(store, key);
    return { ok: true };
  }
  const { left } = recordFail(store, key);
  const base = authError(error);
  return fail(left > 0 ? `${base} (${left} ${left === 1 ? "try" : "tries"} left)` : `${base} Too many wrong tries. Please wait 15 minutes.`);
}

export const verifyCode = (t: Target, token: string, type: "login" | "signup" | "recovery" = "login") =>
  guarded(targetKey(t), () =>
    t.kind === "phone"
      ? sb().auth.verifyOtp({ phone: t.e164, token, type: "sms" })
      : sb().auth.verifyOtp({ email: t.email, token, type: type === "signup" ? "signup" : type === "recovery" ? "recovery" : "email" }),
  );

export const signInWithPassword = (email: string, password: string) => guarded(`pw:${email}`, () => sb().auth.signInWithPassword({ email, password }));

/** New email + password account. A code is emailed to confirm it. */
export async function signUp(email: string, password: string): Promise<Result> {
  const problem = firstProblem(password, email);
  if (problem) return fail(`Choose a stronger password. ${problem}.`);
  const key = `e:${email}`;
  const stop = blocked(key);
  if (stop) return fail(stop);
  recordOtp(store, key);
  const { error } = await sb().auth.signUp({ email, password });
  return error ? fail(authError(error)) : { ok: true };
}

/** Forgot password: emails a 6-digit code (not a link). */
export async function sendResetCode(email: string): Promise<Result> {
  const key = `e:${email}`;
  const stop = blocked(key);
  if (stop) return fail(stop);
  recordOtp(store, key);
  const { error } = await sb().auth.resetPasswordForEmail(email);
  return error ? fail(authError(error)) : { ok: true };
}

export async function savePassword(password: string, email = ""): Promise<Result> {
  const problem = firstProblem(password, email);
  if (problem) return fail(`Choose a stronger password. ${problem}.`);
  const { error } = await sb().auth.updateUser({ password });
  return error ? fail(authError(error)) : { ok: true };
}

// ---------- adding sign-in methods to the account you are already in ----------

/** Add an email to this account. A 6-digit code is emailed to prove it is yours. */
export async function addEmail(email: string): Promise<Result> {
  const key = `e:${email}`;
  const stop = blocked(key);
  if (stop) return fail(stop);
  recordOtp(store, key);
  const { error } = await sb().auth.updateUser({ email });
  return error ? fail(authError(error)) : { ok: true };
}

export const confirmEmail = (email: string, token: string) =>
  guarded(`e:${email}`, () => sb().auth.verifyOtp({ email, token, type: "email_change" }));

/** Add a mobile number to this account. A 6-digit SMS code proves it. Counts toward the SMS limit. */
export async function addPhone(e164: string): Promise<Result> {
  const key = `p:${e164}`;
  const stop = blocked(key);
  if (stop) return fail(stop);
  recordOtp(store, key);
  const { error } = await sb().auth.updateUser({ phone: e164 });
  return error ? fail(authError(error)) : { ok: true };
}

export const confirmPhone = (e164: string, token: string) =>
  guarded(`p:${e164}`, () => sb().auth.verifyOtp({ phone: e164, token, type: "phone_change" }));

/** Sign out the other phones and computers. This one stays signed in. */
export async function signOutOthers(): Promise<Result> {
  const { error } = await sb().auth.signOut({ scope: "others" });
  return error ? fail(authError(error)) : { ok: true };
}
