"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { byAge, generationLabel } from "@/shared/lib/graph";
import { ageFrom, formatAge } from "@/shared/lib/age";
import { labelFor } from "@/modules/relations/engine";
import { Avatar } from "@/shared/ui/Avatar";
import { Input, Select } from "@/shared/ui/form";
import { DEFAULT_LIST, filterPeople, placesIn, type ListOptions, type SortBy, type Status } from "../people";
import type { ViewProps } from "./types";

const STATUS: { id: Status; label: string }[] = [
  { id: "all", label: "All" }, { id: "living", label: "Living" }, { id: "deceased", label: "Passed away" },
];
const SORTS: { id: SortBy; label: string }[] = [
  { id: "generation", label: "By generation" }, { id: "name", label: "Name A to Z" },
  { id: "oldest", label: "Oldest first" }, { id: "youngest", label: "Youngest first" }, { id: "place", label: "Native place" },
];

export default function ListView({ graph, ego, rels, levels, style, visible }: ViewProps) {
  const [o, setO] = useState<ListOptions>(DEFAULT_LIST);
  const set = (patch: Partial<ListOptions>) => setO((s) => ({ ...s, ...patch }));
  const places = useMemo(() => placesIn(graph), [graph]);
  const ids = useMemo(() => filterPeople(graph, visible, o), [graph, visible, o]);
  const active = o.query || o.place || o.status !== "all" || o.missingBirthDate;

  const row = (id: string) => {
    const p = graph.persons.get(id)!;
    const age = formatAge(ageFrom(p.dob, p.dobp, { deathDate: p.dod }), p.alive);
    const label = id === ego ? null : labelFor(rels.get(id), style);
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
            <span className="block truncate text-xs opacity-60">
              {[age, p.np, p.dobp === "unknown" ? "no birth date" : "", p.uid ? "on Nammoor" : ""].filter(Boolean).join(" · ")}
            </span>
          </span>
          {id === ego ? (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">You</span>
          ) : (
            label?.title && <span className="max-w-[40%] truncate text-right text-sm font-semibold text-brand">{label.title}</span>
          )}
        </Link>
      </li>
    );
  };

  let body;
  if (!ids.length) {
    body = <p className="p-4 text-center text-sm opacity-70">{active ? "Nobody matches these filters." : "Nobody to show here."}</p>;
  } else if (o.sort === "generation") {
    const by = new Map<number, string[]>();
    for (const id of ids) by.set(levels.get(id) ?? 0, [...(by.get(levels.get(id) ?? 0) ?? []), id]);
    body = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([level, group]) => (
      <section key={level} className="flex flex-col gap-1">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide opacity-60">{ego ? generationLabel(level) : `Generation ${level + 1}`}</h2>
        <ul className="divide-y divide-black/5 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">{group.sort(byAge(graph)).map(row)}</ul>
      </section>
    ));
  } else {
    body = <ul className="divide-y divide-black/5 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">{ids.map(row)}</ul>;
  }

  return (
    <>
      <Input type="search" placeholder="Search name, nickname or place" aria-label="Search" value={o.query} onChange={(e) => set({ query: e.target.value })} />
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Living or passed away">
        {STATUS.map((s) => (
          <button key={s.id} aria-pressed={o.status === s.id} onClick={() => set({ status: s.id })}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm ${o.status === s.id ? "border-brand bg-brand/15 font-medium text-brand" : "border-black/15 dark:border-white/20"}`}>{s.label}</button>
        ))}
        <button aria-pressed={o.missingBirthDate} onClick={() => set({ missingBirthDate: !o.missingBirthDate })}
          className={`min-h-10 shrink-0 rounded-full border px-4 text-sm ${o.missingBirthDate ? "border-brand bg-brand/15 font-medium text-brand" : "border-black/15 dark:border-white/20"}`}>No birth date</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label="Native place" value={o.place} onChange={(e) => set({ place: e.target.value })}>
          <option value="">All places</option>
          {places.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select aria-label="Sort" value={o.sort} onChange={(e) => set({ sort: e.target.value as SortBy })}>
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
      </div>
      <p className="px-1 text-xs opacity-60">
        {ids.length} {ids.length === 1 ? "person" : "people"}
        {active && <button type="button" className="ml-2 text-brand underline" onClick={() => setO({ ...DEFAULT_LIST, sort: o.sort })}>Clear filters</button>}
      </p>
      {body}
    </>
  );
}
