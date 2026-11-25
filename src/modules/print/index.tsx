"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { getGraph } from "@/shared/lib/graphStore";
import type { Graph } from "@/shared/lib/graph";
import { getCurrentFamilyId } from "@/shared/lib/storage";
import { friendlyError } from "@/shared/lib/errors";
import { RequireAuth } from "@/shared/ui/RequireAuth";
import { Header } from "@/shared/ui/Header";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { Button, ErrorText, Field, Input, Select } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";
import { backupFileName, saveBinaryFile } from "@/modules/backup/file";
import { buildBookInput, layoutBook, type BookExtras } from "./book";
import { planPoster, type PosterOptions } from "./poster";
import { browserMeasure, makePdf, paint, type Images } from "./render";

export default function PrintModule() {
  return <RequireAuth>{(uid) => <Print userId={uid} />}</RequireAuth>;
}

const today = () => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

interface Info {
  name: string;
  nativePlace: string | null;
}

function Print({ userId }: { userId: string }) {
  const familyId = useSearchParams().get("family") ?? getCurrentFamilyId();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"poster" | "book">("poster");

  useEffect(() => {
    if (!familyId) return;
    let alive = true;
    Promise.all([getGraph(familyId), sb().from("families").select("name, native_place").eq("id", familyId).maybeSingle()])
      .then(([g, f]) => {
        if (!alive) return;
        if (f.error) return setError(friendlyError(f.error));
        setGraph(g);
        setInfo({ name: f.data?.name ?? "Our family", nativePlace: f.data?.native_place ?? null });
      })
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [familyId]);

  if (!familyId) return <main className="p-6"><p>Open a family first.</p></main>;
  if (error) return <main className="p-6"><ErrorText>{error}</ErrorText></main>;
  if (!graph || !info) return <ModuleLoading />;

  return (
    <div className="flex flex-1 flex-col">
      <Header title="Print & share" sub={info.name} back="/tree/" />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        <div role="tablist" className="grid grid-cols-2 rounded-lg border border-black/15 p-1 dark:border-white/20">
          {(["poster", "book"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-10 rounded-md text-sm font-medium ${tab === t ? "bg-brand text-white" : ""}`}>
              {t === "poster" ? "Tree poster" : "Story book"}
            </button>
          ))}
        </div>
        {tab === "poster" ? <Poster graph={graph} info={info} userId={userId} /> : <Book graph={graph} info={info} familyId={familyId} />}
        <p className="text-xs opacity-60">The PDF is made on your phone. Nothing is uploaded. Pages are pictures, so the text cannot be searched, but it prints sharp.</p>
      </main>
    </div>
  );
}

function Poster({ graph, info, userId }: { graph: Graph; info: Info; userId: string }) {
  const me = [...graph.persons.values()].find((p) => p.uid === userId)?.id ?? null;
  const people = useMemo(() => [...graph.persons.values()].sort((a, b) => a.name.localeCompare(b.name)), [graph]);
  const [o, setO] = useState<PosterOptions>({ size: "A4", side: "all", depth: 4, egoId: me ?? people[0]?.id ?? null, title: info.name, generatedOn: today() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const plan = useMemo(() => planPoster(graph, o, browserMeasure), [graph, o]);

  useEffect(() => {
    if (plan && canvas.current) paint(plan.page, new Map(), 0.9, canvas.current);
  }, [plan]);

  async function make() {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      const px = o.size === "A3" ? 1.5 : 2;
      const bytes = await makePdf([plan.page], new Map(), px, `${o.title} · Family Tree`);
      const r = await saveBinaryFile(backupFileName(info.name, "pdf", "nammoor-tree"), "application/pdf", bytes, `${o.title} family tree`);
      if (r.how !== "cancelled") toast(r.how === "shared" ? "Poster ready ✓" : "Poster downloaded ✓");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof PosterOptions>(k: K, v: PosterOptions[K]) => setO((c) => ({ ...c, [k]: v }));
  return (
    <section className="flex flex-col gap-3" aria-label="Family tree poster">
      <Field label="Title"><Input value={o.title} maxLength={60} onChange={(e) => set("title", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paper"><Select value={o.size} onChange={(e) => set("size", e.target.value as "A4" | "A3")}><option value="A4">A4</option><option value="A3">A3 (big wall poster)</option></Select></Field>
        <Field label="Side"><Select value={o.side} onChange={(e) => set("side", e.target.value as PosterOptions["side"])}><option value="all">Whole family</option><option value="paternal">Father&apos;s side</option><option value="maternal">Mother&apos;s side</option></Select></Field>
      </div>
      <Field label="Centred on"><Select value={o.egoId ?? ""} onChange={(e) => set("egoId", e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Field label={`Generations: ${o.depth}`}><input type="range" min={2} max={8} value={o.depth} onChange={(e) => set("depth", Number(e.target.value))} className="h-10 w-full" /></Field>
      {!plan ? (
        <p className="text-sm opacity-70">Nobody to show with these choices.</p>
      ) : (
        <>
          <canvas ref={canvas} aria-label="Poster preview" className="w-full rounded-lg border border-black/15 bg-white dark:border-white/20" />
          <p className="text-sm opacity-70">{plan.people} people · {plan.landscape ? "landscape" : "portrait"} {o.size}</p>
          {plan.tooSmall && (
            <div role="alert" className="rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
              The writing will be very small when printed.
              {plan.suggestion ? " Choose A3 paper, or " : " "}show fewer generations or one side of the family.
              {plan.suggestion && <button type="button" onClick={() => set("size", plan.suggestion!)} className="ml-2 min-h-10 font-semibold underline">Use A3</button>}
            </div>
          )}
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <Button busy={busy} disabled={!plan} onClick={make}>Make poster PDF</Button>
    </section>
  );
}

function Book({ graph, info, familyId }: { graph: Graph; info: Info; familyId: string }) {
  const [storiesOnly, setStoriesOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const count = [...graph.persons.values()].length;

  async function make() {
    setBusy(true);
    setError("");
    setProgress("Gathering stories…");
    try {
      const { data, error } = await sb().from("persons").select("id, history, birth_place, current_city, native_place").eq("family_id", familyId).limit(2000);
      if (error) throw error;
      const extras = new Map<string, BookExtras>((data ?? []).map((r) => [r.id, r]));
      const input = buildBookInput(graph, extras, { familyName: info.name, nativePlace: info.nativePlace, generatedOn: today(), storiesOnly });
      if (!input.people.length) throw new Error("Nobody has a story or a photo yet. Add some, or turn off “only people with a story”.");
      const { pages, photoRefs } = layoutBook(input, browserMeasure);
      setProgress("Loading photos…");
      const images: Images = new Map();
      const signed = photoRefs.length ? await sb().storage.from("person-photos").createSignedUrls(photoRefs, 600) : { data: [] };
      await Promise.all(
        (signed.data ?? []).map(async (s) => {
          try {
            if (s.signedUrl && s.path) images.set(s.path, await createImageBitmap(await (await fetch(s.signedUrl)).blob()));
          } catch {
            /* a photo that does not load is simply left out */
          }
        }),
      );
      const bytes = await makePdf(pages, images, 1.6, `${info.name} · Family Story Book`, (d, t) => setProgress(`Drawing page ${d} of ${t}…`));
      images.forEach((b) => b.close());
      const r = await saveBinaryFile(backupFileName(info.name, "pdf", "nammoor-book"), "application/pdf", bytes, `${info.name} family story book`);
      if (r.how !== "cancelled") toast(r.how === "shared" ? "Story book ready ✓" : "Story book downloaded ✓");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Family story book">
      <p className="text-sm">A printed book with a cover, a page for each person (photo, native place, their story, parents, partner and children) and a timeline of births, marriages and passings.</p>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" className="size-5" checked={storiesOnly} onChange={(e) => setStoriesOnly(e.target.checked)} />
        <span>Only people with a story or a photo</span>
      </label>
      <p className="text-xs opacity-60">{count} people in the tree{count > 120 ? ". A book holds the first 120." : "."}</p>
      <ErrorText>{error}</ErrorText>
      {progress && <p role="status" className="text-sm">{progress}</p>}
      <Button busy={busy} onClick={make}>Make story book PDF</Button>
    </section>
  );
}
