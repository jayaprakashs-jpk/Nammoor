"use client";

import { useMemo } from "react";
import type { Graph } from "@/shared/lib/graph";
import { computeInsights } from "@/shared/lib/insights";

export function InsightsCard({ graph }: { graph: Graph }) {
  const i = useMemo(() => computeInsights(graph), [graph]);
  const oldest = i.oldestLiving ? graph.persons.get(i.oldestLiving.id) : null;
  const livePct = i.total ? Math.round((i.living / i.total) * 100) : 0;
  return (
    <details className="rounded-xl border border-black/10 px-3 py-2 dark:border-white/15">
      <summary className="min-h-8 cursor-pointer select-none text-sm font-medium">
        Family insights · {i.total} people, {i.living} living
      </summary>
      <div className="mt-3 flex flex-col gap-3 pb-1 text-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Members", i.total], ["Living", i.living], ["Passed away", i.deceased]].map(([k, v]) => (
            <div key={k as string} className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
              <p className="text-xl font-bold text-brand">{v}</p>
              <p className="text-xs opacity-70">{k}</p>
            </div>
          ))}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="img" aria-label={`${livePct}% living`}>
          <div className="h-full bg-brand" style={{ width: `${livePct}%` }} />
        </div>
        {oldest && i.oldestLiving && (
          <p>Oldest living: <b>{oldest.name}</b> · {i.oldestLiving.approx ? "about " : ""}{i.oldestLiving.years} years</p>
        )}
        {i.topPlaces.length > 0 && (
          <div>
            <p className="mb-1 font-medium">Top native places</p>
            <ul className="flex flex-col gap-1">
              {i.topPlaces.map((p) => (
                <li key={p.place} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate">{p.place}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                    <span className="block h-full bg-brand" style={{ width: `${(p.count / i.topPlaces[0].count) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right tabular-nums">{p.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs opacity-60">
          {i.marriages} marriages{i.missingBirthDate > 0 && ` · ${i.missingBirthDate} people have no birth date yet`}
        </p>
      </div>
    </details>
  );
}
