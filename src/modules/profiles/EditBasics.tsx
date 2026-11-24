"use client";

import { useState, type FormEvent } from "react";
import { sb, type Enums } from "@/shared/lib/supabase";
import { friendlyError } from "@/shared/lib/errors";
import { Button, ErrorText, Field, Input, Section, Select, TextArea } from "@/shared/ui/form";
import { DateInput } from "./DateInput";
import { assertUpdated, type Person } from "./api";
import { COUNTRIES, GENDERS, INDIAN_STATES } from "./places";

const EDITABLE = [
  "full_name", "initials", "nickname", "name_native", "gender", "birth_date", "birth_precision",
  "birth_time", "birth_place", "birth_order", "is_living", "death_date", "death_precision",
  "native_place", "current_city", "state_code", "country_code", "history",
] as const;
type Form = Pick<Person, (typeof EDITABLE)[number]>;

// Keep spaces while typing. Trim only when saving.
const blankToNull = (v: string) => (v.trim() === "" ? null : v);

export function EditBasics({ person, onSaved }: { person: Person; onSaved: () => void }) {
  const [f, setF] = useState<Form>(() => Object.fromEntries(EDITABLE.map((k) => [k, person[k]])) as Form);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const trimmed = Object.fromEntries(
      Object.entries(f).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]),
    ) as Form;
    const patch: Form = {
      ...trimmed,
      full_name: f.full_name.trim(),
      death_date: f.is_living ? null : f.death_date,
      death_precision: f.is_living ? "unknown" : f.death_precision,
      state_code: f.country_code === "IN" ? f.state_code : null,
    };
    const { data, error } = await sb().from("persons").update(patch).eq("id", person.id).select("id");
    setBusy(false);
    try {
      if (error) throw error;
      assertUpdated(data);
      onSaved();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Section title="Name">
        <Field label="Full name">
          <Input required maxLength={120} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Initials" hint="Example: S. R.">
            <Input maxLength={12} value={f.initials ?? ""} onChange={(e) => set("initials", blankToNull(e.target.value))} />
          </Field>
          <Field label="Nickname">
            <Input maxLength={60} value={f.nickname ?? ""} onChange={(e) => set("nickname", blankToNull(e.target.value))} />
          </Field>
        </div>
        <Field label="Name in Tamil" hint="தமிழில் பெயர்">
          <Input maxLength={120} lang="ta" value={f.name_native ?? ""} onChange={(e) => set("name_native", blankToNull(e.target.value))} />
        </Field>
        <Field label="Gender" hint="Needed for correct relation names">
          <Select value={f.gender} onChange={(e) => set("gender", e.target.value as Enums<"gender_t">)}>
            {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </Section>

      <Section title="Birth">
        <DateInput label="Date of birth" value={f.birth_date} precision={f.birth_precision}
          onChange={(v, p) => setF((s) => ({ ...s, birth_date: v, birth_precision: p }))} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Birth time" hint="For Jathagam later">
            <Input type="time" value={f.birth_time?.slice(0, 5) ?? ""} onChange={(e) => set("birth_time", e.target.value || null)} />
          </Field>
          <Field label="Birth order" hint="1 = eldest child">
            <Input type="number" inputMode="numeric" min={1} max={30} value={f.birth_order ?? ""}
              onChange={(e) => set("birth_order", e.target.value ? Number(e.target.value) : null)} />
          </Field>
        </div>
        <Field label="Birth place">
          <Input maxLength={120} value={f.birth_place ?? ""} onChange={(e) => set("birth_place", blankToNull(e.target.value))} />
        </Field>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={!f.is_living} onChange={(e) => set("is_living", !e.target.checked)} />
          <span>Passed away</span>
        </label>
        {!f.is_living && (
          <DateInput label="Date of death" value={f.death_date} precision={f.death_precision}
            onChange={(v, p) => setF((s) => ({ ...s, death_date: v, death_precision: p }))} />
        )}
      </Section>

      <Section title="Place">
        <Field label="Native place (oor)">
          <Input maxLength={120} value={f.native_place ?? ""} onChange={(e) => set("native_place", blankToNull(e.target.value))} />
        </Field>
        <Field label="Lives in (city)">
          <Input maxLength={120} value={f.current_city ?? ""} onChange={(e) => set("current_city", blankToNull(e.target.value))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country">
            <Select value={f.country_code ?? ""} onChange={(e) => set("country_code", e.target.value || null)}>
              <option value="">Not set</option>
              {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          {f.country_code === "IN" && (
            <Field label="State">
              <Select value={f.state_code ?? ""} onChange={(e) => set("state_code", e.target.value || null)}>
                <option value="">Not set</option>
                {INDIAN_STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          )}
        </div>
      </Section>

      <Section title="Family history">
        <TextArea maxLength={5000} placeholder="Stories, origin of the family, things the next generation should know"
          value={f.history ?? ""} onChange={(e) => set("history", blankToNull(e.target.value))} />
      </Section>

      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} disabled={!f.full_name.trim()}>Save</Button>
    </form>
  );
}
