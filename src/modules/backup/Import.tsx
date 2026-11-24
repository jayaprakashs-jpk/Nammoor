"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { isNativeApp } from "@/shared/lib/platform";
import { getGraph, invalidateGraph } from "@/shared/lib/graphStore";
import type { Graph } from "@/shared/lib/graph";
import { friendlyError } from "@/shared/lib/errors";
import { toast } from "@/shared/ui/Toast";
import { Button, ErrorText, Section } from "@/shared/ui/form";
import { findMatches, planImport, toPayload, type Choice } from "./dedupe";
import { parseGedcom } from "./gedcom";
import { ImportError, parseBackupJson } from "./json";
import { MAX_FILE_BYTES, type ImportData } from "./types";

export function Import({ familyId }: { familyId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ImportData | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [choices, setChoices] = useState<Map<string, Choice>>(new Map());
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const matches = useMemo(() => (data && graph ? findMatches(graph, data) : new Map()), [data, graph]);
  const plan = useMemo(() => (data && graph ? planImport(graph, data, matches, choices) : null), [data, graph, matches, choices]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setData(null);
    setBusy(true);
    try {
      if (file.size > MAX_FILE_BYTES) throw new ImportError("This file is bigger than 5 MB. It is probably not a family tree file.");
      const text = await file.text();
      const looksJson = text.trimStart().startsWith("{");
      const parsed = looksJson ? parseBackupJson(text) : parseGedcom(text);
      const g = await getGraph(familyId, true); // fresh, so the duplicate check sees the latest
      const m = findMatches(g, parsed);
      // sure matches are linked by default; vague ones are added as new unless you say otherwise
      setChoices(new Map([...m].map(([ref, x]) => [ref, x.confidence === "same" ? "link" : "new"] as [string, Choice])));
      setGraph(g);
      setData(parsed);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof ImportError ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!data || !plan) return;
    if (!window.confirm(`Add ${plan.added} new ${plan.added === 1 ? "person" : "people"} to this family tree?`)) return;
    setBusy(true);
    setError("");
    const { data: res, error } = await sb().rpc("import_family_data", { p_family_id: familyId, p_data: toPayload(data, matches, choices) as never });
    setBusy(false);
    if (error) {
      const m = friendlyError(error);
      setError(m);
      return toast(`Import failed. Nothing was changed. ${m}`, "error");
    }
    invalidateGraph(familyId);
    const r = res as { added: number; linked: number; parent_links: number; marriages: number };
    toast(`Imported ${r.added} people ✓`);
    router.replace("/tree/");
  }

  const name = (ref: string) => data?.persons.find((p) => p.ref === ref)?.full_name ?? "";
  const rows = data?.persons.filter((p) => matches.has(p.ref)) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Section title="Add people from a file">
        <p className="text-sm">Choose a Nammoor backup (.json) or a GEDCOM file (.ged). You will see what is in it before anything is added.</p>
        <input type="file" id="import-file" className="sr-only" {...(isNativeApp() ? {} : { accept: ".json,.ged,.gedcom,application/json,text/plain" })}
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        <label htmlFor="import-file" className={`min-h-12 cursor-pointer rounded-lg bg-brand px-4 py-3 text-center font-medium text-white ${busy ? "opacity-50" : ""}`}>
          {busy && !data ? "Reading..." : "Choose file"}
        </label>
        <ErrorText>{error}</ErrorText>
      </Section>

      {data && plan && (
        <>
          <Section title={`Preview · ${fileName}`}>
            <div className="grid grid-cols-2 gap-2 text-center">
              {[["New people", plan.added], ["Already here", plan.linked], ["Parent links", plan.newParentLinks], ["Marriages", plan.newMarriages]].map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
                  <p className="text-xl font-bold text-brand">{v}</p>
                  <p className="text-xs opacity-70">{k}</p>
                </div>
              ))}
            </div>
            <p className="text-xs opacity-70">
              {data.source === "gedcom" ? "GEDCOM file" : "Nammoor backup"} · {data.persons.length} people in the file. Imported people are not linked to any account.
            </p>
            {plan.errors.map((e) => <ErrorText key={e}>{e}</ErrorText>)}
            {data.warnings.length > 0 && (
              <details className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950">
                <summary className="cursor-pointer font-medium">{data.warnings.length} things to know</summary>
                <ul className="mt-2 list-disc pl-5">{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}
          </Section>

          {rows.length > 0 && (
            <Section title="Possible duplicates">
              <p className="text-xs opacity-70">These people look like someone already in your tree. Choose what to do with each.</p>
              {rows.slice(0, 60).map((p) => {
                const m = matches.get(p.ref)!;
                const ex = graph?.persons.get(m.id);
                const v = choices.get(p.ref) ?? "new";
                return (
                  <label key={p.ref} className="flex flex-col gap-1 rounded-lg border border-black/10 p-3 dark:border-white/15">
                    <span className="text-sm font-medium">{name(p.ref)}{p.birth_date ? ` · born ${p.birth_date.slice(0, 4)}` : ""}</span>
                    <span className="text-xs opacity-70">
                      {m.confidence === "same" ? "Same name and birth year as" : "Same name as"} <b>{ex?.name}</b>{ex?.dob && ex.dobp !== "unknown" ? ` (born ${ex.dob.slice(0, 4)})` : ""}
                    </span>
                    <select value={v} onChange={(e) => setChoices((c) => new Map(c).set(p.ref, e.target.value as Choice))}
                      className="min-h-12 rounded-lg border border-black/15 bg-white px-3 dark:border-white/20 dark:bg-stone-900" aria-label={`What to do with ${name(p.ref)}`}>
                      <option value="link">Same person: do not add again, fill in missing details</option>
                      <option value="new">Different person: add as new</option>
                    </select>
                  </label>
                );
              })}
              {rows.length > 60 && <p className="text-xs opacity-70">Showing the first 60 of {rows.length}. The rest follow your default choice.</p>}
            </Section>
          )}

          <Button onClick={run} busy={busy} disabled={plan.errors.length > 0 || (plan.added === 0 && plan.newParentLinks === 0 && plan.newMarriages === 0 && plan.linked === 0)}>
            Import {plan.added} {plan.added === 1 ? "person" : "people"}
          </Button>
          {plan.errors.length > 0 && <p className="text-center text-xs opacity-70">Fix the problems above, or change the duplicate choices, to continue.</p>}
        </>
      )}
    </div>
  );
}
