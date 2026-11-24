"use client";

import { useState, type FormEvent } from "react";
import { sb, type Enums, type DB } from "@/shared/lib/supabase";
import { friendlyError } from "@/shared/lib/errors";
import { Button, ErrorText, Field, Input, Section, Select } from "@/shared/ui/form";
import type { Member, Person, PersonBundle } from "./api";

type FieldName = Enums<"private_field_t">;
type Json = DB["Tables"]["person_private_fields"]["Row"]["value"];
interface Salary { amount?: number; currency?: string; period?: "month" | "year" }
interface Dna { provider?: string; haplogroup?: string }

const fmtSalary = (s: Salary) =>
  s.amount ? `${s.currency ?? "INR"} ${s.amount.toLocaleString("en-IN")} per ${s.period ?? "year"}` : "";

/** Read-only view for someone the owner shared with. */
export function SharedPrivateView({ bundle }: { bundle: PersonBundle }) {
  if (!bundle.privateFields.length) return null;
  return (
    <Section title="Shared with you privately">
      {bundle.privateFields.map((f) => (
        <p key={f.field} className="text-sm">
          <span className="font-medium">{f.field === "salary" ? "Income" : "DNA"}: </span>
          {f.field === "salary"
            ? fmtSalary(f.value as Salary)
            : [(f.value as Dna).provider, (f.value as Dna).haplogroup].filter(Boolean).join(" · ")}
        </p>
      ))}
    </Section>
  );
}

/** Owner's editor. Hidden by default: nobody sees these until shared. */
export function PrivateEditor({ bundle, userId, onSaved }: { bundle: PersonBundle; userId: string; onSaved: () => void }) {
  const { person } = bundle;
  const get = (f: FieldName) => bundle.privateFields.find((x) => x.field === f);
  const salary = (get("salary")?.value ?? {}) as Salary;
  const dna = (get("dna")?.value ?? {}) as Dna;

  const [amount, setAmount] = useState(salary.amount ? String(salary.amount) : "");
  const [currency, setCurrency] = useState(salary.currency ?? "INR");
  const [period, setPeriod] = useState<"month" | "year">(salary.period ?? "year");
  const [provider, setProvider] = useState(dna.provider ?? "");
  const [haplo, setHaplo] = useState(dna.haplogroup ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function write(field: FieldName, value: Json | null) {
    const exists = !!get(field);
    if (value === null) {
      if (exists) {
        const { error } = await sb().from("person_private_fields").delete().eq("person_id", person.id).eq("field", field);
        if (error) throw error;
      }
      return;
    }
    const q = exists
      ? sb().from("person_private_fields").update({ value }).eq("person_id", person.id).eq("field", field)
      : sb().from("person_private_fields").insert({ person_id: person.id, family_id: person.family_id, field, value });
    const { error } = await q;
    if (error) throw error;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const n = Number(amount.replace(/[^\d.]/g, ""));
      await write("salary", n > 0 ? { amount: n, currency, period } : null);
      await write("dna", provider.trim() || haplo.trim() ? { provider: provider.trim(), haplogroup: haplo.trim() } : null);
      onSaved();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Private · only you can see">
      <p className="text-xs opacity-70">
        Hidden from everyone, family admins included, until you share it below.
      </p>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Field label="Income">
            <Input inputMode="numeric" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {["INR", "USD", "AED", "SGD", "MYR", "GBP", "EUR"].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Per">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as "month" | "year")}>
              <option value="month">month</option>
              <option value="year">year</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="DNA test provider"><Input maxLength={80} value={provider} onChange={(e) => setProvider(e.target.value)} /></Field>
          <Field label="Haplogroup"><Input maxLength={40} placeholder="R1a1" value={haplo} onChange={(e) => setHaplo(e.target.value)} /></Field>
        </div>
        <p className="text-xs opacity-60">Only the provider and haplogroup. Never upload raw DNA files.</p>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="secondary" busy={busy}>Save private details</Button>
      </form>
      <ShareList bundle={bundle} userId={userId} onSaved={onSaved} />
    </Section>
  );
}

function ShareList({ bundle, userId, onSaved }: { bundle: PersonBundle; userId: string; onSaved: () => void }) {
  const [error, setError] = useState("");
  const others = bundle.members.filter((m) => m.user_id !== userId);
  const has = (m: Member, f: FieldName) => bundle.grants.some((g) => g.grantee_id === m.user_id && g.field === f);
  const fieldsSet = bundle.privateFields.map((f) => f.field);

  async function toggle(m: Member, f: FieldName) {
    setError("");
    const q = has(m, f)
      ? sb().from("private_field_grants").delete().eq("person_id", bundle.person.id).eq("field", f).eq("grantee_id", m.user_id)
      : sb().from("private_field_grants").insert({ person_id: bundle.person.id, family_id: bundle.person.family_id, field: f, grantee_id: m.user_id });
    const { error } = await q;
    if (error) return setError(friendlyError(error));
    onSaved();
  }

  if (!fieldsSet.length) return null;
  if (!others.length) return <p className="text-xs opacity-60">Invite relatives to be able to share with them.</p>;
  return (
    <div className="flex flex-col gap-2 border-t border-black/10 pt-3 dark:border-white/15">
      <p className="text-sm font-medium">Share with</p>
      {others.map((m) => (
        <div key={m.user_id} className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{m.name}</span>
          <span className="flex gap-2">
            {fieldsSet.map((f) => (
              <button key={f} type="button" onClick={() => toggle(m, f)} aria-pressed={has(m, f)}
                className={`min-h-10 rounded-full border px-3 ${has(m, f) ? "border-brand bg-brand text-white" : "border-black/20 dark:border-white/25"}`}>
                {f === "salary" ? "Income" : "DNA"}
              </button>
            ))}
          </span>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export type { Person };
