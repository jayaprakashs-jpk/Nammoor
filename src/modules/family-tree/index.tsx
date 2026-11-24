"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sb, type Enums } from "@/shared/lib/supabase";
import { byAge, generationLabel, generations, type Graph } from "@/shared/lib/graph";
import { getGraph } from "@/shared/lib/graphStore";
import { ageFrom, formatAge } from "@/shared/lib/age";
import { getCurrentFamilyId, setCurrentFamilyId } from "@/shared/lib/storage";
import { friendlyError } from "@/shared/lib/errors";
import { RequireAuth } from "@/shared/ui/RequireAuth";
import { Header } from "@/shared/ui/Header";
import { Avatar, signedPhotoUrls } from "@/shared/ui/Avatar";
import { Button, ErrorText, Input, Select } from "@/shared/ui/form";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { CreateFamily } from "./CreateFamily";

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

  useEffect(() => {
    let alive = true;
    fetchFamilies(userId)
      .then((list) => alive && setFamilies(list))
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [userId, reloadKey]);

  // Chosen family: the one picked now, else last used, else first.
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

  const groups = useMemo(() => {
    if (!graph) return [];
    const levels = generations(graph, me);
    const q = query.trim().toLowerCase();
    const byLevel = new Map<number, string[]>();
    for (const p of graph.persons.values()) {
      if (q && !`${p.name} ${p.nick ?? ""}`.toLowerCase().includes(q)) continue;
      const l = levels.get(p.id) ?? 0;
      byLevel.set(l, [...(byLevel.get(l) ?? []), p.id]);
    }
    return [...byLevel.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, ids]) => ({ level, ids: ids.sort(byAge(graph)) }));
  }, [graph, me, query]);

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

  return (
    <div className="flex flex-1 flex-col">
      <Header
        title={family.name}
        sub={[family.native_place, graph ? `${graph.persons.size} people` : ""].filter(Boolean).join(" · ")}
        back="/"
        right={
          canInvite ? (
            <Link href={`/invite/?family=${family.id}`} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">
              Invite
            </Link>
          ) : null
        }
      />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        {families.length > 1 && (
          <Select value={family.id} onChange={(e) => setPicked(e.target.value)} aria-label="Switch family">
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        )}

        {!graph ? (
          <ModuleLoading />
        ) : (
          <>
            {graph.persons.size > 8 && (
              <Input type="search" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
            )}
            {graph.persons.size <= 1 && me && (
              <div className="rounded-xl bg-amber-50 p-4 text-sm dark:bg-amber-950">
                Your tree has just you. Open your profile and add your father, mother, spouse or children.
                <Link href={`/person/?id=${me}`} className="mt-2 block font-medium text-brand">
                  Open my profile &rarr;
                </Link>
              </div>
            )}
            {groups.map(({ level, ids }) => (
              <section key={level} className="flex flex-col gap-1">
                <h2 className="px-1 text-xs font-semibold uppercase tracking-wide opacity-60">
                  {me ? generationLabel(level) : `Generation ${level + 1}`}
                </h2>
                <ul className="divide-y divide-black/5 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">
                  {ids.map((id) => {
                    const p = graph.persons.get(id)!;
                    const age = formatAge(ageFrom(p.dob, p.dobp, { deathDate: p.dod }), p.alive);
                    return (
                      <li key={id} style={{ contentVisibility: "auto", containIntrinsicSize: "64px" }}>
                        <Link href={`/person/?id=${id}`} className="flex items-center gap-3 p-3 active:bg-black/5">
                          <Avatar name={p.name} path={p.photo} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {p.name}
                              {p.nick && <span className="font-normal opacity-60"> ({p.nick})</span>}
                              {!p.alive && <span className="opacity-60"> †</span>}
                            </span>
                            <span className="block text-xs opacity-60">
                              {[age, p.uid ? "on Nammoor" : ""].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          {id === me && (
                            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">You</span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Link href="/invite/" className="text-center text-sm text-brand underline">
            Join another family with an invite code
          </Link>
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </main>
    </div>
  );
}
