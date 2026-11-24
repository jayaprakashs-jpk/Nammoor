"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { safeNext, useSession } from "@/shared/lib/session";
import { friendlyError } from "@/shared/lib/errors";
import { Button, ErrorText, Field, Input } from "@/shared/ui/form";

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
