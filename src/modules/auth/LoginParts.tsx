"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button, ErrorText, Field, Input, Select } from "@/shared/ui/form";
import { COUNTRIES, DEFAULT_COUNTRY, looksLikePhone, type Country } from "./identifier";
import { passwordRules } from "./password";
import { resendWait } from "./limits";
import { store, targetKey, type Target } from "./flows";

/** One box for email or mobile. A country picker (India first) appears while a number is typed. */
export function SmartInput({ value, onChange, country, onCountry }: { value: string; onChange: (v: string) => void; country: Country; onCountry: (c: Country) => void }) {
  const phone = looksLikePhone(value) && !value.trim().startsWith("+") && !value.trim().startsWith("00");
  // The label is tied to the input by id. Wrapping both controls in one <label> would
  // attach it to the country picker instead, and screen readers would lose the name.
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="identifier" className="text-sm font-medium">Email or mobile number</label>
      <div className="flex gap-2">
        {phone && (
          <Select aria-label="Country code" value={country.code} onChange={(e) => onCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? DEFAULT_COUNTRY)} className="!w-28 shrink-0">
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>)}
          </Select>
        )}
        <Input id="identifier" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="username" inputMode={phone ? "tel" : "email"} autoCapitalize="none" spellCheck={false}
          placeholder="you@example.com or 98765 43210" aria-describedby="identifier-hint" required />
      </div>
      <span id="identifier-hint" className="text-xs opacity-60">{phone ? `We will text a 6-digit code to this number in ${country.name}.` : "We will send you a 6-digit code."}</span>
    </div>
  );
}

/** Password box with a big Show button (older eyes) and the rules ticking off as you type. */
export function PasswordField({ label = "Password", value, onChange, email = "", showRules = false, autoComplete = "current-password" }: {
  label?: string; value: string; onChange: (v: string) => void; email?: string; showRules?: boolean; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const id = useId();
  const rules = passwordRules(value, email);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        {/* label tied by id, so the Show button is not part of the field's name */}
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <div className="flex gap-2">
          <Input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} required />
          <button type="button" onClick={() => setShow((x) => !x)} aria-pressed={show} className="min-h-12 shrink-0 rounded-lg border border-black/15 px-4 text-sm font-medium dark:border-white/20">
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {showRules && (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Password rules">
          {rules.map((r) => (
            <li key={r.id} className={r.ok ? "text-green-700 dark:text-green-400" : "opacity-70"}>
              <span aria-hidden>{r.ok ? "✓" : "○"}</span> {r.label}
              <span className="sr-only">{r.ok ? " done" : " not yet"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The 6 digit code step: big boxes, resend with a countdown, a way back. */
export function CodeStep({ target, info, error, busy, onVerify, onResend, onBack, backLabel = "Use a different email or number", children }: {
  target: Target; info: string; error: string; busy: boolean; onVerify: (code: string) => void; onResend: () => void; onBack: () => void; backLabel?: string; children?: ReactNode;
}) {
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(() => resendWait(store, targetKey(target)));
  useEffect(() => {
    const t = window.setInterval(() => setWait(resendWait(store, targetKey(target))), 1000);
    return () => window.clearInterval(t);
  }, [target]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onVerify(code.trim()); }} className="flex flex-col gap-4">
      <p className="text-sm">{info}</p>
      <Field label="6-digit code">
        <Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center text-2xl tracking-[0.5em]" aria-label="Code" />
      </Field>
      {children}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} disabled={code.length !== 6}>Verify</Button>
      <Button type="button" variant="secondary" onClick={onResend} disabled={wait > 0 || busy}>{wait > 0 ? `Send again in ${wait}s` : "Send the code again"}</Button>
      <Button type="button" variant="ghost" onClick={onBack}>{backLabel}</Button>
    </form>
  );
}
