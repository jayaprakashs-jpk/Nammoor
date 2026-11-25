"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { sb, type Enums } from "@/shared/lib/supabase";
import { childrenOf, parentsOf, siblingsOf, spousesOf, type Graph, type Union } from "@/shared/lib/graph";
import { ageFrom, formatAge, formatDate } from "@/shared/lib/age";
import { invalidateGraph } from "@/shared/lib/graphStore";
import { friendlyError } from "@/shared/lib/errors";
import { Avatar } from "@/shared/ui/Avatar";
import { Button, ErrorText, Field, Input, Section, Select } from "@/shared/ui/form";
import { DateInput } from "./DateInput";
import { AddDuplicateHint } from "./DuplicateHints";
import type { Person } from "./api";

type Relation = "father" | "mother" | "spouse" | "child" | "sibling";
type Gender = Enums<"gender_t">;
type Precision = Enums<"date_precision_t">;

const ADD_BUTTONS: { label: string; relation: Relation; gender?: Gender }[] = [
  { label: "Father · அப்பா", relation: "father" },
  { label: "Mother · அம்மா", relation: "mother" },
  { label: "Husband / Wife", relation: "spouse" },
  { label: "Son · மகன்", relation: "child", gender: "male" },
  { label: "Daughter · மகள்", relation: "child", gender: "female" },
  { label: "Brother", relation: "sibling", gender: "male" },
  { label: "Sister", relation: "sibling", gender: "female" },
];

const pairFilter = (a: string, b: string) =>
  `and(partner_a.eq.${a},partner_b.eq.${b}),and(partner_a.eq.${b},partner_b.eq.${a})`;

export function Relatives({ person, graph, editable, onChanged }: {
  person: Person; graph: Graph; editable: boolean; onChanged: () => void;
}) {
  const [adding, setAdding] = useState<(typeof ADD_BUTTONS)[number] | null>(null);
  const [error, setError] = useState("");
  const id = person.id;

  const changed = () => {
    invalidateGraph(person.family_id);
    onChanged();
  };

  async function unlink(kind: "parent" | "child" | "spouse", other: string, name: string) {
    if (!window.confirm(`Remove the link between ${person.full_name} and ${name}? The people stay in the tree.`)) return;
    setError("");
    const q =
      kind === "spouse"
        ? sb().from("unions").delete().or(pairFilter(id, other)).select("id")
        : kind === "parent"
          ? sb().from("parent_child").delete().eq("parent_id", other).eq("child_id", id).select("parent_id")
          : sb().from("parent_child").delete().eq("parent_id", id).eq("child_id", other).select("parent_id");
    const { data, error } = await q;
    if (error) return setError(friendlyError(error));
    if (!data?.length) return setError("You don't have permission to do that.");
    changed();
  }

  const groups: { title: string; kind: "parent" | "child" | "spouse" | null; ids: string[] }[] = [
    { title: "Parents", kind: "parent", ids: parentsOf(graph, id) },
    { title: "Husband / Wife", kind: "spouse", ids: spousesOf(graph, id).map((s) => s.id) },
    { title: "Brothers & sisters", kind: null, ids: siblingsOf(graph, id) },
    { title: "Children", kind: "child", ids: childrenOf(graph, id) },
  ];

  return (
    <Section title="Family · உறவுகள்">
      {groups.map((g) =>
        g.ids.length ? (
          <div key={g.title} className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">{g.title}</h3>
            {g.ids.map((rid) => {
              const r = graph.persons.get(rid);
              if (!r) return null;
              const union = g.kind === "spouse" ? spousesOf(graph, id).find((s) => s.id === rid)?.union : undefined;
              return (
                <div key={rid} className="flex flex-col">
                  <div className="flex items-center gap-3">
                    <Link href={`/person/?id=${rid}`} className="flex min-h-12 flex-1 items-center gap-3">
                      <Avatar name={r.name} path={r.photo} size={36} />
                      <span className="min-w-0">
                        <span className="block truncate">{r.name}{!r.alive && " †"}</span>
                        <span className="block text-xs opacity-60">{formatAge(ageFrom(r.dob, r.dobp, { deathDate: r.dod }), r.alive)}</span>
                      </span>
                    </Link>
                    {editable && g.kind && (
                      <button type="button" onClick={() => unlink(g.kind!, rid, r.name)} aria-label={`Unlink ${r.name}`}
                        className="min-h-10 px-2 text-sm opacity-60">✕</button>
                    )}
                  </div>
                  {union && <MarriageDate person={person} partner={rid} union={union} editable={editable} onSaved={changed} />}
                </div>
              );
            })}
          </div>
        ) : null,
      )}
      <ErrorText>{error}</ErrorText>

      {editable && !adding && (
        <div className="flex flex-col gap-2 border-t border-black/10 pt-3 dark:border-white/15">
          <p className="text-sm font-medium">Add a relative of {person.full_name}</p>
          <div className="flex flex-wrap gap-2">
            {ADD_BUTTONS.map((b) => (
              <button key={b.label} type="button" onClick={() => setAdding(b)}
                className="min-h-10 rounded-full border border-black/15 px-3 text-sm dark:border-white/20">
                + {b.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {adding && (
        <AddRelative person={person} choice={adding} onCancel={() => setAdding(null)}
          onAdded={() => { setAdding(null); changed(); }} />
      )}
    </Section>
  );
}

function MarriageDate({ person, partner, union, editable, onSaved }: {
  person: Person; partner: string; union: Union; editable: boolean; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string | null>(union.married);
  const [prec, setPrec] = useState<Precision>(union.married ? "exact" : "unknown");
  const [error, setError] = useState("");

  async function save() {
    const { data, error } = await sb()
      .from("unions")
      .update({ married_on: date, married_precision: prec })
      .or(pairFilter(person.id, partner))
      .select("id");
    if (error) return setError(friendlyError(error));
    if (!data?.length) return setError("You don't have permission to do that.");
    setOpen(false);
    onSaved();
  }

  const label = union.married ? `Married ${formatDate(union.married, "exact")}` : "Marriage date not set";
  if (!open)
    return (
      <p className="pl-12 text-xs opacity-70">
        {label}
        {editable && (
          <button type="button" className="ml-2 text-brand underline" onClick={() => setOpen(true)}>edit</button>
        )}
      </p>
    );
  return (
    <div className="flex flex-col gap-2 pl-12">
      <DateInput label="Marriage date" value={date} precision={prec} onChange={(v, p) => { setDate(v); setPrec(p); }} />
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={save}>Save</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function AddRelative({ person, choice, onCancel, onAdded }: {
  person: Person; choice: (typeof ADD_BUTTONS)[number]; onCancel: () => void; onAdded: () => void;
}) {
  const opposite: Gender = person.gender === "male" ? "female" : person.gender === "female" ? "male" : "unknown";
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>(choice.gender ?? (choice.relation === "spouse" ? opposite : "unknown"));
  const [dob, setDob] = useState<string | null>(null);
  const [prec, setPrec] = useState<Precision>("unknown");
  const [order, setOrder] = useState("");
  const [place, setPlace] = useState("");
  const [dead, setDead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const showOrder = choice.relation === "child" || choice.relation === "sibling";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await sb().rpc("add_relative", {
      p_anchor: person.id,
      p_relation: choice.relation,
      p_person: {
        full_name: name.trim(), gender, birth_date: dob, birth_precision: dob ? prec : "unknown",
        birth_order: order ? Number(order) : null, is_living: !dead, native_place: place.trim() || null,
      },
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    onAdded();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-black/10 pt-3 dark:border-white/15">
      <p className="font-medium">Add {choice.label.split(" · ")[0].toLowerCase()} of {person.full_name}</p>
      <Field label="Full name"><Input required autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      {choice.relation === "spouse" && (
        <Field label="Gender">
          <Select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="unknown">Not set</option>
          </Select>
        </Field>
      )}
      <DateInput label="Date of birth" value={dob} precision={prec} onChange={(v, p) => { setDob(v); setPrec(p); }} />
      {showOrder && (
        <Field label="Birth order among siblings" hint="1 = eldest. Decides Anna/Thambi, Periyappa/Chithappa when DOB is missing">
          <Input type="number" inputMode="numeric" min={1} max={30} value={order} onChange={(e) => setOrder(e.target.value)} />
        </Field>
      )}
      <Field label="Native place (oor)" hint="Optional. Helps us spot people already in your tree.">
        <Input maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} />
      </Field>
      <AddDuplicateHint familyId={person.family_id} anchorId={person.id} candidate={{ name, birthYear: dob && prec !== "unknown" ? Number(dob.slice(0, 4)) : null, nativePlace: place, gender }} />
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" className="h-5 w-5" checked={dead} onChange={(e) => setDead(e.target.checked)} />
        <span>Passed away</span>
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" busy={busy} disabled={!name.trim()} className="flex-1">Add</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
