"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { ageFrom, formatAge, formatDate } from "@/shared/lib/age";
import { invalidateGraph } from "@/shared/lib/graphStore";
import { useRelationStyle } from "@/shared/lib/prefs";
import { computeRelations, labelFor } from "@/modules/relations/engine";
import { friendlyError } from "@/shared/lib/errors";
import { RequireAuth } from "@/shared/ui/RequireAuth";
import { Header } from "@/shared/ui/Header";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { Button, ErrorText, Section } from "@/shared/ui/form";
import { canEdit, loadPerson, ownsPrivate, type PersonBundle } from "./api";
import { PhotoPicker } from "./PhotoPicker";
import { EditBasics } from "./EditBasics";
import { ContactEditor, EducationEditor, WorkEditor } from "./Details";
import { PrivateEditor, SharedPrivateView } from "./PrivatePanel";
import { Relatives } from "./Relatives";
import { COUNTRIES, EDUCATION_LEVELS, INDIAN_STATES } from "./places";

export default function ProfilesModule() {
  return <RequireAuth>{(uid) => <PersonRoute userId={uid} />}</RequireAuth>;
}

function PersonRoute({ userId }: { userId: string }) {
  const router = useRouter();
  const id = useSearchParams().get("id");
  useEffect(() => {
    if (!id) router.replace("/tree/");
  }, [id, router]);
  if (!id) return null;
  // key: a new id gets a fresh screen, no stale state from the last person
  return <PersonScreen key={id} id={id} userId={userId} />;
}

function PersonScreen({ id, userId }: { id: string; userId: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<PersonBundle | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [style] = useRelationStyle(userId);

  const reload = useCallback(
    (force = false) => {
      loadPerson(id, userId, force)
        .then(setBundle)
        .catch((e) => setError(friendlyError(e)));
    },
    [id, userId],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  if (error) return <main className="p-6"><ErrorText>{error}</ErrorText></main>;
  if (bundle === undefined) return <ModuleLoading />;
  if (bundle === null)
    return (
      <main className="flex flex-col gap-3 p-6">
        <p>This person was not found, or you are not in their family.</p>
        <Link href="/tree/" className="text-brand underline">Back to family tree</Link>
      </main>
    );

  const { person: p } = bundle;
  const editable = canEdit(p, bundle.myRole, userId);
  const isOwner = ownsPrivate(p, userId);
  const saved = () => {
    invalidateGraph(p.family_id);
    reload(true);
  };

  async function remove() {
    if (!window.confirm(`Delete ${p.full_name} from the tree? This cannot be undone.`)) return;
    const { data, error } = await sb().from("persons").delete().eq("id", p.id).select("id");
    if (error || !data?.length) return setError(error ? friendlyError(error) : "You don't have permission to do that.");
    invalidateGraph(p.family_id);
    router.replace("/tree/");
  }

  const meNode = [...bundle.graph.persons.values()].find((x) => x.uid === userId);
  const relLabel =
    meNode && meNode.id !== p.id ? labelFor(computeRelations(bundle.graph, meNode.id).get(p.id), style) : null;
  const age = formatAge(ageFrom(p.birth_date, p.birth_precision, { deathDate: p.death_date }), p.is_living);
  const place = [
    p.current_city,
    INDIAN_STATES.find((s) => s[0] === p.state_code)?.[1],
    p.country_code && p.country_code !== "IN" ? COUNTRIES.find((c) => c[0] === p.country_code)?.[1] : null,
  ].filter(Boolean).join(", ");
  const facts: [string, string | null | undefined][] = [
    ["Born", [formatDate(p.birth_date, p.birth_precision), p.birth_time?.slice(0, 5), p.birth_place].filter(Boolean).join(" · ")],
    ["Died", p.is_living ? null : formatDate(p.death_date, p.death_precision) || "Yes"],
    ["Birth order", p.birth_order ? `#${p.birth_order} among siblings` : null],
    ["Native place", p.native_place],
    ["Lives in", place],
  ];

  return (
    <div className="flex flex-1 flex-col">
      <Header
        title={p.full_name}
        sub={p.name_native ?? undefined}
        back="/tree/"
        right={
          editable ? (
            <button onClick={() => setEditing((e) => !e)} className="rounded-lg border border-brand px-3 py-2 text-sm text-brand">
              {editing ? "Done" : "Edit"}
            </button>
          ) : null
        }
      />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <PhotoPicker person={p} editable={editable} onChanged={saved} />
          <p className="text-xl font-semibold">
            {p.initials && <span className="opacity-70">{p.initials} </span>}
            {p.full_name}
            {p.nickname && <span className="font-normal opacity-60"> ({p.nickname})</span>}
          </p>
          {relLabel?.title && (
            <p className="text-lg font-semibold text-brand">
              {relLabel.title}
              {relLabel.sub && <span className="block text-xs font-normal opacity-70">{relLabel.sub}</span>}
            </p>
          )}
          <p className="text-sm opacity-70">
            {[age, p.user_id ? (p.user_id === userId ? "You" : "On Nammoor") : "Not on Nammoor yet"].filter(Boolean).join(" · ")}
          </p>
          {editable && !p.user_id && p.is_living && (
            <Link href={`/invite/?family=${p.family_id}&person=${p.id}`} className="mt-1 text-sm font-medium text-brand underline">
              Invite {p.full_name.split(" ")[0]} to manage this profile
            </Link>
          )}
        </div>

        {editing ? (
          <>
            <EditBasics person={p} onSaved={() => { saved(); setEditing(false); }} />
            <ContactEditor person={p} contact={bundle.contact} onSaved={saved} />
            <EducationEditor person={p} rows={bundle.education} onSaved={saved} />
            <WorkEditor person={p} rows={bundle.occupations} onSaved={saved} />
            {!p.user_id && <Button variant="danger" onClick={remove}>Delete {p.full_name} from tree</Button>}
          </>
        ) : (
          <>
            {facts.some(([, v]) => v) && (
              <Section title="About">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  {facts.filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="contents"><dt className="opacity-60">{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
                {p.history && <p className="whitespace-pre-line text-sm">{p.history}</p>}
              </Section>
            )}
            {bundle.contact && (
              <Section title="Contact">
                <div className="flex flex-col gap-1 text-sm">
                  {bundle.contact.phone && <a className="text-brand" href={`tel:${bundle.contact.phone.replace(/\s/g, "")}`}>{bundle.contact.phone}</a>}
                  {bundle.contact.email && <a className="text-brand" href={`mailto:${bundle.contact.email}`}>{bundle.contact.email}</a>}
                  {bundle.contact.address_line && <span>{bundle.contact.address_line} {bundle.contact.postal_code}</span>}
                  {bundle.contact.visibility === "private" && <span className="text-xs opacity-60">Hidden from the family</span>}
                </div>
              </Section>
            )}
            {(bundle.education.length > 0 || bundle.occupations.length > 0) && (
              <Section title="Education & work">
                <ul className="flex flex-col gap-1 text-sm">
                  {bundle.education.map((r) => (
                    <li key={r.id}>🎓 {[EDUCATION_LEVELS.find((l) => l[0] === r.level)?.[1], r.course, r.institution, r.year_completed].filter(Boolean).join(" · ")}</li>
                  ))}
                  {bundle.occupations.map((r) => (
                    <li key={r.id}>💼 {[r.title, r.organization, r.city, r.is_current ? null : "past"].filter(Boolean).join(" · ")}</li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}

        <Relatives person={p} graph={bundle.graph} editable={editable} onChanged={() => reload(true)} />

        {isOwner ? (
          <PrivateEditor key={bundle.privateFields.map((f) => f.updated_at).join()} bundle={bundle} userId={userId} onSaved={() => reload(true)} />
        ) : (
          <SharedPrivateView bundle={bundle} />
        )}
      </main>
    </div>
  );
}
