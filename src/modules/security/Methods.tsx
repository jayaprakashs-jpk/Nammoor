"use client";

import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { Button, ErrorText, Field, Input, Section, Select } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";
import { addEmail, addPhone, confirmEmail, confirmPhone, savePassword, type Result } from "@/modules/auth/flows";
import { startGoogleLink } from "@/modules/auth/google";
import { COUNTRIES, DEFAULT_COUNTRY, parseIdentifier, prettyPhone } from "@/modules/auth/identifier";
import { CodeStep, PasswordField } from "@/modules/auth/LoginParts";
import { isStrong } from "@/modules/auth/password";
import type { Target } from "@/modules/auth/flows";

const Tick = () => <span className="text-green-700 dark:text-green-400" aria-hidden>✓ </span>;

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-black/10 py-3 last:border-0 dark:border-white/15">
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}

export function Methods({ user, providers, onChanged }: { user: User; providers: string[]; onChanged: () => void }) {
  const hasGoogle = providers.includes("google");
  const googleEmail = user.identities?.find((i) => i.provider === "google")?.identity_data?.email as string | undefined;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function linkGoogle() {
    setError("");
    setBusy("google");
    const { error } = await startGoogleLink("/security/");
    setBusy("");
    if (error) setError(error);
  }

  return (
    <Section title="How you sign in">
      <p className="text-sm opacity-80">Add every way you sign in here. Then Google, email and mobile all open the <b>same family tree</b>, not a new empty one.</p>

      <Row title="Google">
        {hasGoogle ? <p><Tick />Linked{googleEmail ? ` · ${googleEmail}` : ""}</p> : (
          <>
            <Button variant="secondary" onClick={linkGoogle} busy={busy === "google"}>Link my Google account</Button>
            <ErrorText>{error}</ErrorText>
          </>
        )}
      </Row>

      <Row title="Email">
        {user.email && user.email_confirmed_at ? <p><Tick />{user.email}</p> : <AddEmail onDone={onChanged} />}
      </Row>

      <Row title="Mobile number">
        {user.phone && user.phone_confirmed_at ? <p><Tick />{prettyPhone(`+${user.phone}`)}</p> : <AddPhone onDone={onChanged} />}
      </Row>

      <Row title="Password">
        <SetPassword email={user.email ?? ""} />
      </Row>
    </Section>
  );
}

function AddEmail({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (t: Target) => {
    setBusy(true);
    setError("");
    const r = await addEmail((t as { email: string }).email);
    setBusy(false);
    if (!r.ok) setError(r.message);
    return r.ok;
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = parseIdentifier(email);
    if (p.kind !== "email") return setError(p.kind === "invalid" ? p.message : "Type your email.");
    if (await send(p)) setTarget(p);
  }
  async function verify(code: string) {
    if (target?.kind !== "email") return;
    setBusy(true);
    const r: Result = await confirmEmail(target.email, code);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    toast("Email added ✓");
    onDone();
  }

  if (target)
    return <CodeStep target={target} info={`We sent a 6-digit code to ${(target as { email: string }).email}.`} error={error} busy={busy} onVerify={verify} onResend={() => void send(target)} onBack={() => { setTarget(null); setError(""); }} backLabel="Use a different email" />;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <Field label="Add your email"><Input type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} /></Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="secondary" busy={busy}>Send code</Button>
    </form>
  );
}

function AddPhone({ onDone }: { onDone: () => void }) {
  const [raw, setRaw] = useState("");
  const [code, setCode] = useState(DEFAULT_COUNTRY.code);
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const country = COUNTRIES.find((c) => c.code === code) ?? DEFAULT_COUNTRY;

  const send = async (t: Target) => {
    setBusy(true);
    setError("");
    const r = await addPhone((t as { e164: string }).e164);
    setBusy(false);
    if (!r.ok) setError(r.message);
    return r.ok;
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = parseIdentifier(raw, country);
    if (p.kind === "email") return setError("Type a mobile number here, not an email.");
    if (p.kind !== "phone") return setError(p.kind === "invalid" ? p.message : "Type your mobile number.");
    if (await send(p)) setTarget(p);
  }
  async function verify(c: string) {
    if (target?.kind !== "phone") return;
    setBusy(true);
    const r = await confirmPhone(target.e164, c);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    toast("Mobile number added ✓");
    onDone();
  }

  if (target)
    return <CodeStep target={target} info={`We sent a 6-digit code by SMS to ${prettyPhone((target as { e164: string }).e164)}.`} error={error} busy={busy} onVerify={verify} onResend={() => void send(target)} onBack={() => { setTarget(null); setError(""); }} backLabel="Use a different number" />;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="add-phone" className="text-sm font-medium">Add your mobile number</label>
        <div className="flex gap-2">
          <Select aria-label="Country code" value={code} onChange={(e) => setCode(e.target.value)} className="!w-28 shrink-0">
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>)}
          </Select>
          <Input id="add-phone" inputMode="tel" autoComplete="tel-national" value={raw} onChange={(e) => { setRaw(e.target.value); setError(""); }} placeholder="98765 43210" />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="secondary" busy={busy}>Send code</Button>
    </form>
  );
}

function SetPassword({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const same = pw === again;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!same) return setError("The two passwords are not the same.");
    setBusy(true);
    setError("");
    const r = await savePassword(pw, email);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    toast("Password saved ✓");
    setOpen(false);
    setPw("");
    setAgain("");
  }

  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Set or change password</Button>;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <PasswordField label="New password" value={pw} onChange={(v) => { setPw(v); setError(""); }} email={email} showRules autoComplete="new-password" />
      <PasswordField label="Type it again" value={again} onChange={(v) => { setAgain(v); setError(""); }} autoComplete="new-password" />
      {again && !same && <p className="text-sm text-red-700">The two passwords are not the same yet.</p>}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} disabled={!isStrong(pw, email) || !same}>Save password</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </form>
  );
}
