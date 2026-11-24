"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sb, type Enums } from "@/shared/lib/supabase";
import { generations, type Graph } from "@/shared/lib/graph";
import { getGraph } from "@/shared/lib/graphStore";
import { getCurrentFamilyId, readLocal, setCurrentFamilyId, writeLocal } from "@/shared/lib/storage";
import { useRelationStyle } from "@/shared/lib/prefs";
import { friendlyError } from "@/shared/lib/errors";
import { computeRelations, STYLE_NAMES, type RelationStyle } from "@/modules/relations/engine";
import { RequireAuth } from "@/shared/ui/RequireAuth";
import { Header } from "@/shared/ui/Header";
import { signedPhotoUrls } from "@/shared/ui/Avatar";
import { Button, ErrorText, Input, Select } from "@/shared/ui/form";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { CreateFamily } from "./CreateFamily";
import ListView from "./views/ListView";

// Each picture loads only when opened.
const ChartView = dynamic(() => import("./views/ChartView"), { ssr: false, loading: ModuleLoading });
const RoundView = dynamic(() => import("./views/RoundView"), { ssr: false, loading: ModuleLoading });
const CloseView = dynamic(() => import("./views/CloseView"), { ssr: false, loading: ModuleLoading });

type View = "list" | "tree" | "round" | "close";
type Filter = "all" | "paternal" | "maternal";

const VIEWS: { id: View; label: string }[] = [
  { id: "list", label: "List" },
  { id: "tree", label: "Tree" },
  { id: "round", label: "Round" },
  { id: "close", label: "Close" },
];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "paternal", label: "Father's side" },
  { id: "maternal", label: "Mother's side" },
];
const isView = (v: string | null): v is View => VIEWS.some((x) => x.id === v);

interface MyFamily {
  id: string;
  name: string;
  native_place: string | null;
  role: Enums<"family_role_t">;
}

export default function FamilyTreeModule() {
  return <RequireAuth>{(uid) => <TreeScreen userId={uid} />}</RequireAuth>;
}

async function fetchFamilies(userId: string): Promise<MyFamily[]> {
  const { data, error } = await sb()
    .from("family_members")
    .select("role, families(id, name, native_place)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? [])
    .filter((r) => r.families)
    .map((r) => ({ ...r.families!, role: r.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function TreeScreen({ userId }: { userId: string }) {
  const router = useRouter();
  const [families, setFamilies] = useState<MyFamily[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ familyId: string; graph: Graph } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [view, setViewState] = useState<View>(() => {
    const v = readLocal("nammoor.view");
    return isView(v) ? v : "list";
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [viewpoint, setViewpoint] = useState<string | null>(null);
  const [style, setStyle] = useRelationStyle(userId);

  const setView = (v: View) => {
    setViewState(v);
    writeLocal("nammoor.view", v);
  };

  useEffect(() => {
    let alive = true;
    fetchFamilies(userId)
      .then((list) => alive && setFamilies(list))
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [userId, reloadKey]);

  const familyId = useMemo(() => {
    if (!families?.length) return null;
    const want = picked ?? getCurrentFamilyId();
    return families.find((f) => f.id === want)?.id ?? families[0].id;
  }, [families, picked]);

  useEffect(() => {
    if (!familyId) return;
    setCurrentFamilyId(familyId);
    let alive = true;
    getGraph(familyId)
      .then((g) => {
        const photos = [...g.persons.values()].map((p) => p.photo).filter((p): p is string => !!p);
        if (photos.length) signedPhotoUrls(photos); // one request for all photos
        if (alive) setLoaded({ familyId, graph: g });
      })
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [familyId]);

  const graph = loaded && loaded.familyId === familyId ? loaded.graph : null;

  const me = useMemo(
    () => (graph ? [...graph.persons.values()].find((p) => p.uid === userId)?.id ?? null : null),
    [graph, userId],
  );

  // Whose point of view: the one picked, else you, else the first person in the tree.
  const ego = useMemo(() => {
    if (!graph) return null;
    if (viewpoint && graph.persons.has(viewpoint)) return viewpoint;
    if (me) return me;
    return [...graph.persons.values()].sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null;
  }, [graph, viewpoint, me]);

  const rels = useMemo(() => (graph && ego ? computeRelations(graph, ego) : new Map()), [graph, ego]);
  const levels = useMemo(() => (graph ? generations(graph, ego) : new Map<string, number>()), [graph, ego]);

  const visible = useMemo(() => {
    const out = new Set<string>();
    if (!graph) return out;
    const q = view === "list" ? query.trim().toLowerCase() : "";
    for (const p of graph.persons.values()) {
      if (q && !`${p.name} ${p.nick ?? ""}`.toLowerCase().includes(q)) continue;
      if (filter !== "all" && p.id !== ego && rels.get(p.id)?.side !== filter) continue;
      out.add(p.id);
    }
    return out;
  }, [graph, query, filter, ego, rels, view]);

  const sortedPeople = useMemo(
    () => (graph ? [...graph.persons.values()].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [graph],
  );

  async function signOut() {
    await sb().auth.signOut();
    setCurrentFamilyId(null);
    router.replace("/login/");
  }

  if (error) return <main className="p-6"><ErrorText>{error}</ErrorText></main>;
  if (!families) return <ModuleLoading />;
  if (!families.length)
    return <CreateFamily onCreated={(id) => { setCurrentFamilyId(id); setPicked(id); setReloadKey((k) => k + 1); }} />;

  const family = families.find((f) => f.id === familyId)!;
  const canInvite = family.role !== "viewer";
  const open = (id: string) => router.push(`/person/?id=${id}`);
  const viewProps = graph && { graph, ego, rels, levels, style, visible, onOpen: open };

  return (
    <div className="flex flex-1 flex-col">
      <Header
        title={family.name}
        sub={[family.native_place, graph ? `${graph.persons.size} people` : ""].filter(Boolean).join(" · ")}
        back="/"
        right={
          <span className="flex gap-2">
            <Link href={`/chat/?family=${family.id}`} className="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand">
              Chat
            </Link>
            {canInvite && (
              <Link href={`/invite/?family=${family.id}`} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">
                Invite
              </Link>
            )}
          </span>
        }
      />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4">
        {families.length > 1 && (
          <Select value={family.id} onChange={(e) => setPicked(e.target.value)} aria-label="Switch family">
            {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        )}

        <div role="tablist" aria-label="View" className="grid grid-cols-4 rounded-lg border border-black/15 p-1 dark:border-white/20">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
              className={`min-h-10 rounded-md text-sm font-medium ${view === v.id ? "bg-brand text-white" : ""}`}>
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Side of the family">
          {FILTERS.map((f) => (
            <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={`min-h-10 shrink-0 rounded-full border px-4 text-sm ${filter === f.id ? "border-brand bg-brand/15 font-medium text-brand" : "border-black/15 dark:border-white/20"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {graph && (
          <details className="rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/15">
            <summary className="min-h-8 cursor-pointer select-none">Names &amp; point of view</summary>
            <div className="mt-2 flex flex-col gap-3 pb-1">
              <label className="flex flex-col gap-1">
                <span className="font-medium">Relation names</span>
                <Select value={style} onChange={(e) => setStyle(e.target.value as RelationStyle)}>
                  {(Object.keys(STYLE_NAMES) as RelationStyle[]).map((s) => <option key={s} value={s}>{STYLE_NAMES[s]}</option>)}
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">See the tree as</span>
                <Select value={ego ?? ""} onChange={(e) => setViewpoint(e.target.value || null)}>
                  {sortedPeople.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === me ? " (you)" : ""}</option>)}
                </Select>
              </label>
              {!me && <p className="text-xs opacity-70">You are not a person in this tree yet, so names are shown from the person above.</p>}
            </div>
          </details>
        )}

        {!graph || !viewProps ? (
          <ModuleLoading />
        ) : (
          <>
            {view === "list" && graph.persons.size > 8 && (
              <Input type="search" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
            )}
            {graph.persons.size <= 1 && me && (
              <div className="rounded-xl bg-amber-50 p-4 text-sm dark:bg-amber-950">
                Your tree has just you. Open your profile and add your father, mother, spouse or children.
                <Link href={`/person/?id=${me}`} className="mt-2 block font-medium text-brand">Open my profile &rarr;</Link>
              </div>
            )}
            {view === "list" && <ListView {...viewProps} />}
            {view === "tree" && <ChartView {...viewProps} />}
            {view === "round" && <RoundView {...viewProps} />}
            {view === "close" && <CloseView {...viewProps} />}
          </>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Link href="/invite/" className="text-center text-sm text-brand underline">Join another family with an invite code</Link>
          <Button variant="secondary" onClick={signOut}>Sign out</Button>
        </div>
      </main>
    </div>
  );
}
