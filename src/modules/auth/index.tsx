"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { safeNext, useSession } from "@/shared/lib/session";
import { authError } from "@/shared/lib/errors";
import { Button, ErrorText, Field, Input } from "@/shared/ui/form";
import { signInWithPassword, savePassword, sendCode, sendResetCode, signUp, targetLabel, verifyCode, type Result, type Target } from "./flows";
import { startGoogleLogin } from "./google";
import { DEFAULT_COUNTRY, parseIdentifier, type Country } from "./identifier";
import { CodeStep, PasswordField, SmartInput } from "./LoginParts";
import { isStrong } from "./password";

// Simple on purpose. Main screen: Google, or one box for email/mobile and a code.
// Everything else (password, forgot password, new account) is one tap further.
type Screen = "main" | "code" | "password" | "signup" | "forgot" | "newpw" | "name";
type CodeKind = "login" | "signup" | "recovery";

export default function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { userId, loading } = useSession();

  const [screen, setScreen] = useState<Screen>("main");
  const [codeKind, setCodeKind] = useState<CodeKind>("login");
  const [raw, setRaw] = useState("");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [target, setTarget] = useState<Target | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsed = useMemo(() => parseIdentifier(raw, country), [raw, country]);
  const go = (s: Screen) => { setScreen(s); setError(""); };

  // Signed in (any way): make sure we have a name, then go on. Not while setting a new password.
  useEffect(() => {
    if (loading || !userId || screen === "name" || screen === "newpw" || screen === "code" && codeKind === "recovery") return;
    sb().from("profiles").select("display_name").eq("id", userId).single().then(({ data }) => {
      if (data && !data.display_name.trim()) setScreen("name");
      else router.replace(next);
    });
  }, [loading, userId, screen, codeKind, next, router]);

  const run = async (job: () => Promise<Result>, onOk: () => void) => {
    setError("");
    setBusy(true);
    const r = await job();
    setBusy(false);
    if (r.ok) onOk();
    else setError(r.message);
  };

  async function google() {
    setError("");
    setBusy(true);
    const { error } = await startGoogleLogin(next);
    if (error) setError(error);
    setBusy(false);
  }

  function onSendCode(e: FormEvent) {
    e.preventDefault();
    if (parsed.kind === "empty") return setError("Type your email or mobile number.");
    if (parsed.kind === "invalid") return setError(parsed.message);
    if (parsed.kind !== "email" && parsed.kind !== "phone") return;
    const t = parsed as Target;
    void run(() => sendCode(t), () => { setTarget(t); setCodeKind("login"); go("code"); });
  }

  const emailTarget = (): Target | null => {
    const p = parseIdentifier(email);
    if (p.kind === "email") return p;
    setError(p.kind === "empty" ? "Type your email." : "That email does not look right. Check the spelling.");
    return null;
  };

  function onPassword(e: FormEvent) {
    e.preventDefault();
    const t = emailTarget();
    if (t?.kind === "email") void run(() => signInWithPassword(t.email, password), () => {});
  }

  function onSignUp(e: FormEvent) {
    e.preventDefault();
    const t = emailTarget();
    if (t?.kind === "email") void run(() => signUp(t.email, password), () => { setTarget(t); setCodeKind("signup"); go("code"); });
  }

  function onForgot(e: FormEvent) {
    e.preventDefault();
    const t = emailTarget();
    if (t?.kind === "email") void run(() => sendResetCode(t.email), () => { setTarget(t); setCodeKind("recovery"); go("code"); });
  }

  function onVerify(code: string) {
    if (!target) return;
    void run(() => verifyCode(target, code, codeKind), () => { if (codeKind === "recovery") { setPassword(""); go("newpw"); } });
  }

  function onResend() {
    if (!target) return;
    void run(() => (codeKind === "recovery" ? sendResetCode((target as { email: string }).email) : codeKind === "signup" ? signUp((target as { email: string }).email, password) : sendCode(target)), () => setError(""));
  }

  function onNewPassword(e: FormEvent) {
    e.preventDefault();
    void run(() => savePassword(password, target?.kind === "email" ? target.email : ""), () => router.replace(next));
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setBusy(true);
    const { error } = await sb().from("profiles").update({ display_name: name.trim() }).eq("id", userId);
    setBusy(false);
    if (error) return setError(authError(error));
    router.replace(next);
  }

  const codeInfo = target ? `We sent a 6-digit code to ${targetLabel(target)}.${target.kind === "email" ? " Check your spam folder too." : ""}${codeKind === "signup" ? " If you already have an account, go back and use Forgot password." : ""}` : "";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-brand">Nammoor</h1>
        <p className="text-sm opacity-70">நம்மூர் · {screen === "forgot" || screen === "newpw" ? "Reset your password" : screen === "signup" ? "Create an account" : "Sign in"}</p>
      </div>

      {screen === "main" && (
        <>
          <button type="button" onClick={google} disabled={busy}
            className="flex min-h-14 items-center justify-center gap-3 rounded-lg border border-black/20 bg-white px-4 py-3 text-lg font-medium text-stone-800 active:scale-[0.98] disabled:opacity-50 dark:border-white/25">
            <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z" />
              <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google
          </button>
          <p className="-my-2 text-center text-sm opacity-60">or</p>
          <form onSubmit={onSendCode} noValidate className="flex flex-col gap-4">
            <SmartInput value={raw} onChange={(v) => { setRaw(v); setError(""); }} country={country} onCountry={setCountry} />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" busy={busy}>Send code</Button>
          </form>
          <div className="flex flex-col gap-3 border-t border-black/10 pt-5 dark:border-white/15">
            <Button type="button" variant="secondary" onClick={() => go("password")}>Sign in with Email &amp; Password</Button>
          </div>
        </>
      )}

      {screen === "code" && target && (
        <CodeStep target={target} info={codeInfo} error={error} busy={busy} onVerify={onVerify} onResend={onResend}
          onBack={() => go(codeKind === "login" ? "main" : codeKind === "signup" ? "signup" : "forgot")}
          backLabel={codeKind === "login" ? "Use a different email or number" : "Go back"} />
      )}

      {screen === "password" && (
        <form onSubmit={onPassword} noValidate className="flex flex-col gap-4">
          <Field label="Email"><Input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} required /></Field>
          <PasswordField value={password} onChange={(v) => { setPassword(v); setError(""); }} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy}>Sign in</Button>
          <Button type="button" variant="ghost" onClick={() => go("forgot")}>Forgot password?</Button>
          <Button type="button" variant="ghost" onClick={() => go("signup")}>Create a new account</Button>
          <Button type="button" variant="ghost" onClick={() => go("main")}>&larr; Back to code sign in</Button>
        </form>
      )}

      {screen === "signup" && (
        <form onSubmit={onSignUp} noValidate className="flex flex-col gap-4">
          <Field label="Email"><Input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} required /></Field>
          <PasswordField label="Choose a password" value={password} onChange={(v) => { setPassword(v); setError(""); }} email={email} showRules autoComplete="new-password" />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} disabled={!isStrong(password, email)}>Create account</Button>
          <Button type="button" variant="ghost" onClick={() => go("password")}>&larr; Back</Button>
        </form>
      )}

      {screen === "forgot" && (
        <form onSubmit={onForgot} noValidate className="flex flex-col gap-4">
          <p className="text-sm">Type your email. We will send a 6-digit code to set a new password.</p>
          <Field label="Email"><Input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} required /></Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy}>Send reset code</Button>
          <Button type="button" variant="ghost" onClick={() => go("password")}>&larr; Back</Button>
        </form>
      )}

      {screen === "newpw" && (
        <form onSubmit={onNewPassword} noValidate className="flex flex-col gap-4">
          <p className="text-sm">The code was right. Now choose a new password.</p>
          <PasswordField label="New password" value={password} onChange={(v) => { setPassword(v); setError(""); }} email={target?.kind === "email" ? target.email : ""} showRules autoComplete="new-password" />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} disabled={!isStrong(password, target?.kind === "email" ? target.email : "")}>Save new password</Button>
        </form>
      )}

      {screen === "name" && (
        <form onSubmit={saveName} className="flex flex-col gap-4">
          <p className="text-sm opacity-80">Welcome! What should your family call you?</p>
          <Field label="Your name"><Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} disabled={!name.trim()}>Continue</Button>
        </form>
      )}
    </main>
  );
}
