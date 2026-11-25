"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/shared/lib/supabase";
import { getGraph } from "@/shared/lib/graphStore";
import type { Graph } from "@/shared/lib/graph";
import { friendlyError } from "@/shared/lib/errors";
import { candidateFrom, closeRelatives, findLikelyDuplicates, type Candidate, type DupMatch } from "@/shared/lib/duplicates";
import { suggestKeep } from "@/modules/merge/keep";
import { toast } from "@/shared/ui/Toast";

const yearOf = (d: string | null, p: string) => (d && p !== "unknown" ? d.slice(0, 4) : "");

function useMatches(familyId: string, cand: Candidate, exclude: (g: Graph) => Set<string>, delay = 350) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [matches, setMatches] = useState<DupMatch[]>([]);
  useEffect(() => {
    let alive = true;
    getGraph(familyId).then((g) => alive && setGraph(g), () => undefined);
    return () => {
      alive = false;
    };
  }, [familyId]);
  const key = `${cand.name}|${cand.birthYear}|${cand.nativePlace}`;
  useEffect(() => {
    if (!graph) return;
    const t = window.setTimeout(() => setMatches(findLikelyDuplicates(graph, cand, { exclude: exclude(graph) })), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, key]);
  return { graph, matches };
}

function Row({ graph, m }: { graph: Graph; m: DupMatch }) {
  const p = graph.persons.get(m.id)!;
  const y = yearOf(p.dob, p.dobp);
  return (
    <span className="block">
      <span className="font-medium">{p.name}</span>
      <span className="opacity-80">{[y && `born ${y}`, p.np].filter(Boolean).length ? ` · ${[y && `born ${y}`, p.np].filter(Boolean).join(" · ")}` : ""}</span>
      <span className="block text-xs opacity-70">{m.reasons.join(", ")}</span>
    </span>
  );
}

/**
 * While adding someone: "Is this person already in your tree?"
 * Looks only at your own family's tree, which you can already see. Nothing leaves the family.
 * `anchorId` = the person you are adding a relative to. Their close family is not flagged (a son can share his father's name).
 */
export function AddDuplicateHint({ familyId, anchorId, candidate }: { familyId: string; anchorId: string; candidate: Candidate }) {
  const { graph, matches } = useMatches(familyId, candidate, (g) => closeRelatives(g, anchorId));
  if (!graph || !matches.length) return null;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="font-semibold">⚠️ Is this person already in your tree?</p>
      <ul className="flex flex-col gap-2">
        {matches.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-2">
            <Row graph={graph} m={m} />
            <Link href={`/person/?id=${m.id}`} className="min-h-10 shrink-0 rounded-lg border border-amber-700 px-3 py-2 text-xs font-medium">Open</Link>
          </li>
        ))}
      </ul>
      <p className="text-xs opacity-80">If it is the same person, open their card instead of adding a new one. If not, go ahead and add.</p>
    </div>
  );
}

/** On a profile: other cards in this tree that look like the same person, with a one-tap merge request. */
export function ProfileDuplicateHint({ familyId, personId, canRequest }: { familyId: string; personId: string; canRequest: boolean }) {
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string> | null>(null);
  const [error, setError] = useState("");
  const [self, setSelf] = useState<ReturnType<typeof candidateFrom> | null>(null);
  const [g0, setG0] = useState<Graph | null>(null);

  useEffect(() => {
    let alive = true;
    getGraph(familyId).then((g) => {
      if (!alive) return;
      setG0(g);
      const p = g.persons.get(personId);
      if (p) setSelf(candidateFrom(p));
    }, () => undefined);
    sb().from("person_merge_requests").select("keep_person_id, drop_person_id").eq("family_id", familyId).eq("status", "pending").then(({ data }) => {
      if (alive) setPending(new Set((data ?? []).flatMap((r) => [r.keep_person_id, r.drop_person_id].filter(Boolean) as string[])));
    });
    return () => {
      alive = false;
    };
  }, [familyId, personId]);

  const { matches } = useMatches(familyId, self ?? { name: "", birthYear: null }, (g) => closeRelatives(g, personId), 0);
  if (!g0 || !self || !matches.length) return null;

  async function ask(m: DupMatch) {
    const a = g0!.persons.get(m.id)!;
    const b = g0!.persons.get(personId)!;
    const { keep, drop } = suggestKeep(a, b);
    setError("");
    const { error } = await sb().from("person_merge_requests").insert({ family_id: familyId, keep_person_id: keep.id, drop_person_id: drop.id, note: `Looks like the same person (${m.reasons.join(", ")})` });
    if (error) return setError(friendlyError(error));
    setAsked((s) => new Set(s).add(m.id));
    toast("Merge request sent to the family admin ✓");
  }

  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="font-semibold">⚠️ This may be the same person as:</p>
      <ul className="flex flex-col gap-2">
        {matches.map((m) => {
          const done = asked.has(m.id) || pending?.has(m.id) || pending?.has(personId);
          return (
            <li key={m.id} className="flex items-start justify-between gap-2">
              <Link href={`/person/?id=${m.id}`}><Row graph={g0} m={m} /></Link>
              {canRequest && (
                <button type="button" disabled={!!done} onClick={() => ask(m)} className="min-h-10 shrink-0 rounded-lg border border-amber-700 px-3 text-xs font-medium disabled:opacity-60">
                  {done ? "Request sent" : "Ask admin to merge"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
      <p className="text-xs opacity-80">Only a family admin can approve a merge. <Link href={`/merge/?family=${familyId}`} className="underline">See merge requests</Link></p>
    </div>
  );
}
