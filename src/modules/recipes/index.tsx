"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { getGraph } from "@/shared/lib/graphStore";
import type { Graph } from "@/shared/lib/graph";
import { getCurrentFamilyId } from "@/shared/lib/storage";
import { friendlyError } from "@/shared/lib/errors";
import { RequireAuth } from "@/shared/ui/RequireAuth";
import { Header } from "@/shared/ui/Header";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { Button, ErrorText, Field, Input, Select, TextArea } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";
import { albumUrls } from "@/modules/album/api";
import { canvasToBlob, loadPhoto } from "@/modules/album/image";
import { deleteRecipe, lines, listRecipes, matches, saveRecipe, type Recipe } from "./api";

export default function RecipesModule() {
  return <RequireAuth>{(uid) => <Recipes userId={uid} />}</RequireAuth>;
}

function Recipes({ userId }: { userId: string }) {
  const familyId = useSearchParams().get("family") ?? getCurrentFamilyId();
  const [list, setList] = useState<Recipe[] | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState("");
  const [view, setView] = useState<Recipe | null>(null);
  const [form, setForm] = useState<{ edit: Recipe | null } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      familyId
        ? Promise.all([
            listRecipes(familyId),
            getGraph(familyId),
            sb().from("family_members").select("role").eq("family_id", familyId).eq("user_id", userId).maybeSingle(),
          ])
            .then(async ([rs, g, m]) => {
              setList(rs);
              setGraph(g);
              setRole(m.data?.role ?? null);
              setUrls(await albumUrls(rs.flatMap((r) => (r.photo_path ? [r.photo_path] : []))));
            })
            .catch((e) => setError(friendlyError(e)))
        : Promise.resolve(),
    [familyId, userId],
  );
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => (list ?? []).filter((r) => matches(r, q)), [list, q]);
  const canAdd = role === "owner" || role === "admin" || role === "editor";
  const isAdmin = role === "owner" || role === "admin";
  const who = (id: string | null) => (id ? graph?.persons.get(id)?.name : null) ?? null;

  if (!familyId) return <main className="p-6"><p>Open a family first.</p></main>;
  if (!list || !graph) return error ? <main className="p-6"><ErrorText>{error}</ErrorText></main> : <ModuleLoading />;

  if (form)
    return (
      <RecipeForm
        familyId={familyId}
        graph={graph}
        edit={form.edit}
        onCancel={() => setForm(null)}
        onSaved={(r) => {
          setForm(null);
          setView(r);
          load();
          toast("Recipe saved ✓");
        }}
      />
    );

  if (view) {
    const r = list.find((x) => x.id === view.id) ?? view;
    return (
      <div className="flex flex-1 flex-col">
        <Header title={r.title} sub={r.title_native ?? undefined} back="/recipes/" right={null} />
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
          <button type="button" onClick={() => setView(null)} className="min-h-12 self-start text-brand">&larr; All recipes</button>
          {r.photo_path && urls.get(r.photo_path) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls.get(r.photo_path)} alt={r.title} className="max-h-72 w-full rounded-xl object-cover" />
          )}
          {who(r.person_id) && <p className="text-sm opacity-80">From <span className="font-medium">{who(r.person_id)}</span></p>}
          <section><h2 className="mb-1 font-semibold">Ingredients · தேவையான பொருட்கள்</h2>
            <ul className="list-disc pl-5">{lines(r.ingredients).map((l, i) => <li key={i}>{l}</li>)}</ul></section>
          <section><h2 className="mb-1 font-semibold">Steps · செய்முறை</h2>
            <ol className="list-decimal pl-5">{lines(r.steps).map((l, i) => <li key={i} className="mb-1">{l}</li>)}</ol></section>
          {(r.created_by === userId || isAdmin) && (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setForm({ edit: r })}>Edit</Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={async () => {
                  if (!window.confirm(`Delete "${r.title}"?`)) return;
                  try {
                    await deleteRecipe(r);
                    setView(null);
                    load();
                  } catch (e) {
                    setError(friendlyError(e));
                  }
                }}
              >
                Delete
              </Button>
            </div>
          )}
          <ErrorText>{error}</ErrorText>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <Header title="Kudumba Samayal" sub="Family recipes · குடும்ப சமையல்" back="/tree/" />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4">
        <Input type="search" aria-label="Search recipes" placeholder="Search by dish or ingredient" value={q} onChange={(e) => setQ(e.target.value)} />
        {canAdd && <Button onClick={() => setForm({ edit: null })}>＋ Add a recipe</Button>}
        <ErrorText>{error}</ErrorText>
        {!list.length && <p className="my-6 text-center text-sm opacity-70">No recipes yet. Save Paati&apos;s sambar before the recipe is lost.</p>}
        {list.length > 0 && !shown.length && <p className="text-center text-sm opacity-70">Nothing matches &ldquo;{q}&rdquo;.</p>}
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setView(r)} className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-black/10 p-2 text-left dark:border-white/15">
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-amber-100 text-2xl dark:bg-amber-900">
                  {r.photo_path && urls.get(r.photo_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls.get(r.photo_path)} alt="" loading="lazy" className="size-full object-cover" />
                  ) : "🍛"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.title}</span>
                  {r.title_native && <span className="block truncate text-sm text-sky-900 dark:text-sky-200">{r.title_native}</span>}
                  {who(r.person_id) && <span className="block truncate text-xs opacity-70">by {who(r.person_id)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function RecipeForm({ familyId, graph, edit, onCancel, onSaved }: { familyId: string; graph: Graph; edit: Recipe | null; onCancel: () => void; onSaved: (r: Recipe) => void }) {
  const [title, setTitle] = useState(edit?.title ?? "");
  const [native, setNative] = useState(edit?.title_native ?? "");
  const [person, setPerson] = useState(edit?.person_id ?? "");
  const [ingredients, setIngredients] = useState(edit?.ingredients ?? "");
  const [steps, setSteps] = useState(edit?.steps ?? "");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const people = useMemo(() => [...graph.persons.values()].sort((a, b) => a.name.localeCompare(b.name)), [graph]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Write the dish name.");
    setBusy(true);
    setError("");
    try {
      const r = await saveRecipe({
        familyId,
        id: edit?.id,
        input: { person_id: person || null, title: title.trim(), title_native: native.trim() || null, ingredients: ingredients.trim(), steps: steps.trim() },
        photo,
        oldPhoto: edit?.photo_path ?? null,
        removePhoto,
      });
      onSaved(r);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <Header title={edit ? "Edit recipe" : "New recipe"} back="/recipes/" />
      <form onSubmit={submit} noValidate className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4">
        <Field label="Dish name (English)"><Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mutton kuzhambu" /></Field>
        <Field label="Dish name (Tamil)"><Input lang="ta" maxLength={120} value={native} onChange={(e) => setNative(e.target.value)} placeholder="மட்டன் குழம்பு" /></Field>
        <Field label="Whose recipe is it?" hint="Link it to a family member.">
          <Select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Nobody in particular</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Ingredients" hint="One on each line"><TextArea rows={6} maxLength={4000} value={ingredients} onChange={(e) => setIngredients(e.target.value)} /></Field>
        <Field label="Steps" hint="One step on each line"><TextArea rows={8} maxLength={8000} value={steps} onChange={(e) => setSteps(e.target.value)} /></Field>
        <div className="flex flex-col gap-2">
          <label htmlFor="recipe-photo" className="text-sm font-medium">Photo of the dish</label>
          <input
            id="recipe-photo"
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setPhoto(await canvasToBlob(await loadPhoto(f)));
                setPhotoName(f.name);
                setRemovePhoto(false);
              } catch {
                setError("Could not read this photo. Try a JPG or PNG.");
              }
            }}
          />
          {photoName && <p className="text-xs opacity-70">Ready: {photoName}</p>}
          {edit?.photo_path && !photo && (
            <label className="flex min-h-12 items-center gap-3"><input type="checkbox" className="size-5" checked={removePhoto} onChange={(e) => setRemovePhoto(e.target.checked)} /><span>Remove the current photo</span></label>
          )}
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button type="submit" busy={busy} className="flex-1">Save recipe</Button>
        </div>
      </form>
    </div>
  );
}
