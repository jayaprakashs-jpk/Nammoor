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
import { clearLock } from "@/shared/lib/appLock";
import { friendlyError } from "@/shared/lib/errors";
import { computeRelations, STYLE_NAMES, type RelationStyle } from "@/modules/relations/engine";
import { RequireAuth } from "@/shared/ui/RequireAuth";
import { Header } from "@/shared/ui/Header";
import { signedPhotoUrls } from "@/shared/ui/Avatar";
import { Button, ErrorText, Select } from "@/shared/ui/form";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { CreateFamily } from "./CreateFamily";
import { InsightsCard } from "./InsightsCard";
import { QuickAdd } from "./QuickAdd";
import { invalidateGraph } from "@/shared/lib/graphStore";
import ListView from "./views/ListView";

// Each picture loads only when opened.
const ChartView = dynamic(() => import("./views/ChartView"), { ssr: false, loading: ModuleLoading });
const RoundView = dynamic(() => import("./views/RoundView"), { ssr: false, loading: ModuleLoading });
const CloseView = dynamic(() => import("./views/CloseView"), { ssr: false, loading: ModuleLoading });
const PedigreeView = dynamic(() => import("./views/PedigreeView"), { ssr: false, loading: ModuleLoading });
const FanView = dynamic(() => import("./views/FanView"), { ssr: false, loading: ModuleLoading });
const TimelineView = dynamic(() => import("./views/TimelineView"), { ssr: false, loading: ModuleLoading });

type View = "list" | "tree" | "pedigree" | "fan" | "round" | "close" | "timeline";
type Filter = "all" | "paternal" | "maternal";

const VIEWS: { id: View; label: string }[] = [
  { id: "list", label: "List" },
  { id: "tree", label: "Tree" },
  { id: "pedigree", label: "Pedigree" },
  { id: "fan", label: "Fan" },
  { id: "round", label: "Round" },
  { id: "close", label: "Close" },
  { id: "timeline", label: "Timeline" },
];
// Which controls make sense for which picture.
const USES_DEPTH: View[] = ["tree", "pedigree", "fan"];
const USES_SIDE: View[] = ["list", "tree", "round", "close", "timeline"];
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
  const [graphKey, setGraphKey] = useState(0); // bump to fetch the tree again
  const [depth, setDepth] = useState(4);
  const [quick, setQuick] = useState<{ childId: string; role: "father" | "mother" } | null>(null);
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
  }, [familyId, graphKey]);

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
    for (const p of graph.persons.values()) {
      if (USES_SIDE.includes(view) && filter !== "all" && p.id !== ego && rels.get(p.id)?.side !== filter) continue;
      // Big trees stay smooth: the Tree picture only shows the chosen number of generations around you.
      if (view === "tree" && ego && Math.abs(levels.get(p.id) ?? 0) > depth - 1) continue;
      out.add(p.id);
    }
    return out;
  }, [graph, filter, ego, rels, view, levels, depth]);

  const sortedPeople = useMemo(
    () => (graph ? [...graph.persons.values()].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [graph],
  );

  async function signOut() {
    await sb().auth.signOut();
    clearLock();
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
  const canEdit = (id: string) => {
    if (family.role === "owner" || family.role === "admin") return true;
    const p = graph?.persons.get(id);
    return family.role === "editor" && !!p && (p.mgr === userId || p.uid === userId);
  };
  const viewProps = graph && { graph, ego, rels, levels, style, visible, onOpen: open, depth, canEdit, onQuickAdd: (childId: string, role: "father" | "mother") => setQuick({ childId, role }) };

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

        <div role="tablist" aria-label="View" className="flex gap-1 overflow-x-auto rounded-lg border border-black/15 p-1 dark:border-white/20">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
              className={`min-h-10 shrink-0 rounded-md px-3 text-sm font-medium ${view === v.id ? "bg-brand text-white" : ""}`}>
              {v.label}
            </button>
          ))}
        </div>

        {USES_SIDE.includes(view) && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Side of the family">
            {FILTERS.map((f) => (
              <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-sm ${filter === f.id ? "border-brand bg-brand/15 font-medium text-brand" : "border-black/15 dark:border-white/20"}`}>
                {f.label}
              </button>
            ))}
          </div>
        )}
        {USES_DEPTH.includes(view) && (
          <label className="flex items-center gap-3 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/15">
            <span className="shrink-0 font-medium">Generations</span>
            <input type="range" min={3} max={7} step={1} value={depth} aria-label="Generations to show" onChange={(e) => setDepth(Number(e.target.value))} className="h-8 flex-1 accent-[#b45309]" />
            <span className="w-8 shrink-0 text-right tabular-nums">{depth === 7 ? "7+" : depth}</span>
          </label>
        )}
        {graph && <InsightsCard graph={graph} />}

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
            {graph.persons.size <= 1 && me && (
              <div className="rounded-xl bg-amber-50 p-4 text-sm dark:bg-amber-950">
                Your tree has just you. Open your profile and add your father, mother, spouse or children.
                <Link href={`/person/?id=${me}`} className="mt-2 block font-medium text-brand">Open my profile &rarr;</Link>
              </div>
            )}
            {view === "list" && <ListView {...viewProps} />}
            {view === "tree" && <ChartView {...viewProps} />}
            {view === "pedigree" && <PedigreeView {...viewProps} />}
            {view === "fan" && <FanView {...viewProps} />}
            {view === "round" && <RoundView {...viewProps} />}
            {view === "timeline" && <TimelineView {...viewProps} />}
            {view === "close" && <CloseView {...viewProps} />}
          </>
        )}

        {quick && graph && (
          <QuickAdd familyId={family.id} childId={quick.childId} childName={graph.persons.get(quick.childId)?.name ?? ""} role={quick.role}
            onClose={() => setQuick(null)}
            onAdded={() => {
              setQuick(null);
              invalidateGraph(family.id);
              setGraphKey((k) => k + 1); // keeps the old picture on screen until the new one arrives
            }} />
        )}

        <div className="mt-4 flex flex-col gap-2">
          {(family.role === "owner" || family.role === "admin") && (
            <Link href={`/backup/?family=${family.id}`} className="text-center text-sm text-brand underline">Backup, export &amp; import</Link>
          )}
          <Link href="/security/" className="text-center text-sm text-brand underline">Security &amp; sign-in</Link>
          <Link href="/invite/" className="text-center text-sm text-brand underline">Join another family with an invite code</Link>
          <Button variant="secondary" onClick={signOut}>Sign out</Button>
        </div>
      </main>
    </div>
  );
}
