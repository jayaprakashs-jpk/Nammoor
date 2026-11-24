"use client";

import { useState, type FormEvent } from "react";
import { sb, type Enums } from "@/shared/lib/supabase";
import { friendlyError } from "@/shared/lib/errors";
import { Button, ErrorText, Field, Input, Section, Select } from "@/shared/ui/form";
import { assertUpdated, type Contact, type Education, type Occupation, type Person } from "./api";
import { EDUCATION_LEVELS } from "./places";

const t = (v: string) => (v.trim() === "" ? null : v.trim());

export function ContactEditor({ person, contact, onSaved }: { person: Person; contact: Contact | null; onSaved: () => void }) {
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [address, setAddress] = useState(contact?.address_line ?? "");
  const [postal, setPostal] = useState(contact?.postal_code ?? "");
  const [visibility, setVisibility] = useState<Enums<"visibility_t">>(contact?.visibility ?? "family");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = { phone: t(phone), email: t(email), address_line: t(address), postal_code: t(postal), visibility };
    try {
      // Not upsert: upsert would try to rewrite person_id, which the DB forbids.
      if (contact) {
        const { data, error } = await sb().from("person_contact").update(values).eq("person_id", person.id).select("person_id");
        if (error) throw error;
        assertUpdated(data);
      } else {
        const { error } = await sb().from("person_contact").insert({ ...values, person_id: person.id, family_id: person.family_id });
        if (error) throw error;
      }
      onSaved();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Contact">
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Phone">
          <Input type="tel" inputMode="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Address">
          <Input maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="PIN code">
            <Input inputMode="numeric" maxLength={12} value={postal} onChange={(e) => setPostal(e.target.value)} />
          </Field>
          <Field label="Who can see">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Enums<"visibility_t">)}>
              <option value="family">Whole family</option>
              <option value="private">Only editors</option>
            </Select>
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="secondary" busy={busy}>Save contact</Button>
      </form>
    </Section>
  );
}

export function EducationEditor({ person, rows, onSaved }: { person: Person; rows: Education[]; onSaved: () => void }) {
  const [level, setLevel] = useState("ug");
  const [course, setCourse] = useState("");
  const [inst, setInst] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await sb().from("person_education").insert({
      person_id: person.id, family_id: person.family_id, level,
      course: t(course), institution: t(inst), year_completed: year ? Number(year) : null,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setCourse(""); setInst(""); setYear("");
    onSaved();
  }

  async function remove(id: string) {
    const { error } = await sb().from("person_education").delete().eq("id", id);
    if (error) return setError(friendlyError(error));
    onSaved();
  }

  return (
    <Section title="Education">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
          <span>{[EDUCATION_LEVELS.find((l) => l[0] === r.level)?.[1], r.course, r.institution, r.year_completed].filter(Boolean).join(" · ")}</span>
          <button type="button" onClick={() => remove(r.id)} className="min-h-10 px-2 text-red-700" aria-label="Remove">✕</button>
        </div>
      ))}
      <form onSubmit={add} className="flex flex-col gap-3 border-t border-black/10 pt-3 dark:border-white/15">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Level">
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              {EDUCATION_LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Year finished">
            <Input type="number" inputMode="numeric" min={1900} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
        </div>
        <Field label="Course"><Input maxLength={120} placeholder="B.E. Civil" value={course} onChange={(e) => setCourse(e.target.value)} /></Field>
        <Field label="College / school"><Input maxLength={160} value={inst} onChange={(e) => setInst(e.target.value)} /></Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="secondary" busy={busy}>Add education</Button>
      </form>
    </Section>
  );
}

export function WorkEditor({ person, rows, onSaved }: { person: Person; rows: Occupation[]; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [org, setOrg] = useState("");
  const [city, setCity] = useState("");
  const [current, setCurrent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await sb().from("person_occupations").insert({
      person_id: person.id, family_id: person.family_id, title: title.trim(),
      organization: t(org), city: t(city), is_current: current,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setTitle(""); setOrg(""); setCity("");
    onSaved();
  }

  async function remove(id: string) {
    const { error } = await sb().from("person_occupations").delete().eq("id", id);
    if (error) return setError(friendlyError(error));
    onSaved();
  }

  return (
    <Section title="Work">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
          <span>{[r.title, r.organization, r.city, r.is_current ? "current" : "past"].filter(Boolean).join(" · ")}</span>
          <button type="button" onClick={() => remove(r.id)} className="min-h-10 px-2 text-red-700" aria-label="Remove">✕</button>
        </div>
      ))}
      <form onSubmit={add} className="flex flex-col gap-3 border-t border-black/10 pt-3 dark:border-white/15">
        <Field label="Job title"><Input required maxLength={120} placeholder="Teacher, Farmer, Engineer" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company / place"><Input maxLength={160} value={org} onChange={(e) => setOrg(e.target.value)} /></Field>
          <Field label="City"><Input maxLength={120} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        </div>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={current} onChange={(e) => setCurrent(e.target.checked)} />
          <span>Current job</span>
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="secondary" busy={busy} disabled={!title.trim()}>Add work</Button>
      </form>
    </Section>
  );
}
