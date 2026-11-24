"use client";

import Link from "next/link";
import { byAge, generationLabel } from "@/shared/lib/graph";
import { ageFrom, formatAge } from "@/shared/lib/age";
import { labelFor } from "@/modules/relations/engine";
import { Avatar } from "@/shared/ui/Avatar";
import type { ViewProps } from "./types";

export default function ListView({ graph, ego, rels, levels, style, visible }: ViewProps) {
  const byLevel = new Map<number, string[]>();
  for (const id of visible) {
    const l = levels.get(id) ?? 0;
    byLevel.set(l, [...(byLevel.get(l) ?? []), id]);
  }
  const groups = [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
  if (!groups.length) return <p className="p-4 text-center text-sm opacity-70">Nobody to show here.</p>;

  return (
    <>
      {groups.map(([level, ids]) => (
        <section key={level} className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide opacity-60">
            {ego ? generationLabel(level) : `Generation ${level + 1}`}
          </h2>
          <ul className="divide-y divide-black/5 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">
            {ids.sort(byAge(graph)).map((id) => {
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
                        {[age, p.uid ? "on Nammoor" : ""].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {id === ego ? (
                      <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">You</span>
                    ) : (
                      label?.title && (
                        <span className="max-w-[40%] text-right">
                          <span className="block truncate text-sm font-semibold text-brand">{label.title}</span>
                        </span>
                      )
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
