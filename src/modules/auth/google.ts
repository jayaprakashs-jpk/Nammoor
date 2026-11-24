import { sb } from "@/shared/lib/supabase";
import { isNativeApp } from "@/shared/lib/platform";
import { readLocal, writeLocal } from "@/shared/lib/storage";
import { safeNext } from "@/shared/lib/session";
import { friendlyError } from "@/shared/lib/errors";

/** The link Google sends people back to inside the Android app. Must match AndroidManifest and Supabase. */
export const NATIVE_REDIRECT = "com.nammoor.app://auth/callback";
const AFTER_LOGIN = "nammoor.afterLogin";

export const redirectUrl = (): string => (isNativeApp() ? NATIVE_REDIRECT : `${window.location.origin}/auth/callback/`);

export interface Callback {
  code: string | null;
  error: string | null;
}

/** Read the code (or the error) out of a return link. Works for the app link and the website link. */
export function parseAuthCallback(url: string): Callback {
  let params: URLSearchParams;
  try {
    const u = new URL(url);
    // errors can come in the query or, for some providers, after the #
    params = new URLSearchParams(u.search);
    if (u.hash.length > 1) for (const [k, v] of new URLSearchParams(u.hash.slice(1))) if (!params.has(k)) params.set(k, v);
  } catch {
    return { code: null, error: "The sign-in link was not valid." };
  }
  const error = params.get("error_description") ?? params.get("error");
  const code = params.get("code");
  if (error) return { code: null, error: error.replace(/\+/g, " ").slice(0, 200) };
  return { code: code && /^[\w-]{6,200}$/.test(code) ? code : null, error: code ? null : "The sign-in link had no code in it." };
}

/** Is this link one of ours? */
export const isAuthCallback = (url: string) => url.startsWith(NATIVE_REDIRECT);

/** Open Google. On the website the page moves to Google; in the app a browser tab opens. */
export async function startGoogleLogin(next: string): Promise<{ error: string | null }> {
  writeLocal(AFTER_LOGIN, safeNext(next));
  const native = isNativeApp();
  const { data, error } = await sb().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectUrl(), skipBrowserRedirect: native, queryParams: { prompt: "select_account" } },
  });
  if (error) return { error: friendlyError(error) };
  if (native && data.url) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: data.url });
  }
  return { error: null };
}

// The same link can arrive twice (cold start + listener). Exchange each code only once.
const inflight = new Map<string, Promise<{ next: string } | { error: string }>>();

/** Turn the return link into a signed-in session. Safe to call twice with the same link. */
export function finishGoogleLogin(url: string): Promise<{ next: string } | { error: string }> {
  const { code, error } = parseAuthCallback(url);
  if (!code) return Promise.resolve({ error: error ?? "Sign in did not finish." });
  const existing = inflight.get(code);
  if (existing) return existing;
  const job = (async () => {
    const { error: err } = await sb().auth.exchangeCodeForSession(code);
    if (err) return { error: friendlyError(err) };
    const next = safeNext(readLocal(AFTER_LOGIN));
    writeLocal(AFTER_LOGIN, null);
    return { next };
  })();
  inflight.set(code, job);
  return job;
}
