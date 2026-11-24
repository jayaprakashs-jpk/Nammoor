"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { safeNext, useSession } from "@/shared/lib/session";
import { friendlyError } from "@/shared/lib/errors";
import { Button, ErrorText, Field, Input } from "@/shared/ui/form";
import { startGoogleLogin } from "./google";

type Step = "email" | "code" | "name";
const CODE_LENGTH = 6;

// Login with a 6-digit email code. No magic links: links can't open the
// Android app without deep-link setup, codes work everywhere.
export default function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { userId, loading } = useSession();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Already signed in (or just verified): make sure we have a name, then go on.
  useEffect(() => {
    if (loading || !userId || step === "name") return;
    sb()
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data && !data.display_name.trim()) setStep("name");
        else router.replace(next);
      });
  }, [loading, userId, step, next, router]);

  async function google() {
    setError("");
    setBusy(true);
    const { error } = await startGoogleLogin(next);
    // on the website the page leaves for Google; we only come back here on an error
    if (error) setError(error);
    setBusy(false);
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await sb().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setInfo(`We sent a ${CODE_LENGTH}-digit code to ${email.trim()}. Check spam too.`);
    setStep("code");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await sb().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    // success: the session effect above takes over
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setBusy(true);
    const { error } = await sb().from("profiles").update({ display_name: name.trim() }).eq("id", userId);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    router.replace(next);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-brand">Nammoor</h1>
        <p className="text-sm opacity-70">நம்மூர் · Sign in with your email</p>
      </div>

      {step === "email" && (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={google} disabled={busy}
            className="flex min-h-12 items-center justify-center gap-3 rounded-lg border border-black/20 bg-white px-4 py-3 font-medium text-stone-800 active:scale-[0.98] disabled:opacity-50 dark:border-white/25">
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z" />
              <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google
          </button>
          <p className="text-center text-xs opacity-60">or use your email</p>
        </div>
      )}
      {step === "email" && (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <Field label="Email">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy}>
            Send code
          </Button>
          <button
            type="button"
            className="text-sm text-brand underline disabled:opacity-40"
            disabled={!email.includes("@")}
            onClick={() => {
              setError("");
              setInfo("");
              setStep("code");
            }}
          >
            I already have a code
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="flex flex-col gap-4">
          {info && <p className="text-sm opacity-80">{info}</p>}
          <Field label={`${CODE_LENGTH}-digit code`} hint={email}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern={`[0-9]{${CODE_LENGTH}}`}
              maxLength={CODE_LENGTH}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-[0.5em]"
              aria-label="Code"
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} disabled={code.length !== CODE_LENGTH}>
            Verify
          </Button>
          <Button type="button" variant="ghost" onClick={() => setStep("email")}>
            Use a different email
          </Button>
        </form>
      )}

      {step === "name" && (
        <form onSubmit={saveName} className="flex flex-col gap-4">
          <p className="text-sm opacity-80">Welcome! What should your family call you?</p>
          <Field label="Your name">
            <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} disabled={!name.trim()}>
            Continue
          </Button>
        </form>
      )}
    </main>
  );
}
