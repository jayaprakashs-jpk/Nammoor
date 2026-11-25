"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { getGraph, invalidateGraph } from "@/shared/lib/graphStore";
import type { Graph } from "@/shared/lib/graph";
import { getCurrentFamilyId } from "@/shared/lib/storage";
import { friendlyError } from "@/shared/lib/errors";
import { RequireAuth } from "@/shared/ui/RequireAuth";
import { Header } from "@/shared/ui/Header";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { Button, ErrorText } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";

interface Req {
  id: string;
  keep_person_id: string | null;
  drop_person_id: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export default function MergeModule() {
  return <RequireAuth>{(uid) => <Merge userId={uid} />}</RequireAuth>;
}

function Merge({ userId }: { userId: string }) {
  const familyId = useSearchParams().get("family") ?? getCurrentFamilyId();
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      familyId
        ? Promise.all([
            sb().from("person_merge_requests").select("id, keep_person_id, drop_person_id, note, status, created_at").eq("family_id", familyId).order("created_at", { ascending: false }).limit(30),
            sb().from("family_members").select("role").eq("family_id", familyId).eq("user_id", userId).maybeSingle(),
            getGraph(familyId, true),
          ])
            .then(([r, role, g]) => {
              if (r.error) return setError(friendlyError(r.error));
              setReqs((r.data ?? []) as Req[]);
              setAdmin(role.data?.role === "owner" || role.data?.role === "admin");
              setGraph(g);
            })
            .catch((e) => setError(friendlyError(e)))
        : Promise.resolve(),
    [familyId, userId],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function decide(r: Req, approve: boolean) {
    const names = `${graph?.persons.get(r.drop_person_id ?? "")?.name} into ${graph?.persons.get(r.keep_person_id ?? "")?.name}`;
    if (approve && !window.confirm(`Merge ${names}? Their links, photos and details are moved. This cannot be undone.`)) return;
    setBusy(r.id);
    setError("");
    const { error } = approve
      ? await sb().rpc("merge_persons", { p_request_id: r.id })
      : await sb().from("person_merge_requests").update({ status: "rejected" }).eq("id", r.id);
    setBusy(null);
    if (error) return setError(friendlyError(error));
    if (familyId) invalidateGraph(familyId);
    toast(approve ? "Merged ✓" : "Request rejected");
    load();
  }

  if (!familyId) return <main className="p-6"><p>Open a family first.</p></main>;
  if (!reqs || !graph) return error ? <main className="p-6"><ErrorText>{error}</ErrorText></main> : <ModuleLoading />;

  const name = (id: string | null) => (id ? graph.persons.get(id)?.name : null) ?? "(removed)";
  const pending = reqs.filter((r) => r.status === "pending");
  const done = reqs.filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-1 flex-col">
      <Header title="Merge requests" sub={admin ? "You decide" : "An admin decides"} back="/tree/" />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        <ErrorText>{error}</ErrorText>
        {!pending.length && <p className="text-sm opacity-70">Nothing waiting. When two cards look like the same person, ask for a merge from their profile.</p>}
        {pending.map((r) => (
          <article key={r.id} className="flex flex-col gap-2 rounded-xl border border-black/10 p-3 dark:border-white/15">
            <p><span className="font-semibold">{name(r.drop_person_id)}</span> will be merged into <span className="font-semibold">{name(r.keep_person_id)}</span></p>
            {r.note && <p className="text-xs opacity-70">{r.note}</p>}
            {admin ? (
              <div className="flex gap-2">
                <Button variant="secondary" busy={busy === r.id} onClick={() => decide(r, false)} className="flex-1">Reject</Button>
                <Button busy={busy === r.id} onClick={() => decide(r, true)} className="flex-1">Approve merge</Button>
              </div>
            ) : (
              <p className="text-xs opacity-70">Waiting for a family admin.</p>
            )}
          </article>
        ))}
        {done.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide opacity-60">Earlier</h2>
            {done.map((r) => (
              <p key={r.id} className="text-sm opacity-80">{r.status === "approved" ? "✓ Merged" : "✕ Rejected"} · {name(r.keep_person_id)} · {new Date(r.created_at).toLocaleDateString("en-IN")}</p>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
