"use client";

import { useMemo, useState } from "react";
import { formatDate } from "@/shared/lib/age";
import { buildTimeline, upcomingReminders, type EventKind } from "@/shared/lib/timeline";
import type { ViewProps } from "./types";

const ICON = { birth: "🎂", marriage: "💍", death: "🕯️", birthday: "🎂", anniversary: "💍", remembrance: "🕯️" } as const;
const FILTERS: { id: "all" | EventKind; label: string }[] = [
  { id: "all", label: "All" }, { id: "birth", label: "Births" }, { id: "marriage", label: "Marriages" }, { id: "death", label: "Deaths" },
];
const PAGE = 60;

const ordinal = (n: number) => {
  const v = n % 100;
  return `${n}${["th", "st", "nd", "rd"][(v - 20) % 10] || ["th", "st", "nd", "rd"][v] || "th"}`;
};

export default function TimelineView({ graph, visible, onOpen }: ViewProps) {
  const [kind, setKind] = useState<"all" | EventKind>("all");
  const [shown, setShown] = useState(PAGE);
  const name = (id: string) => graph.persons.get(id)?.name ?? "?";

  const reminders = useMemo(() => upcomingReminders(graph, new Date(), 30).filter((r) => r.people.some((p) => visible.has(p))), [graph, visible]);
  const events = useMemo(
    () => buildTimeline(graph).filter((e) => (kind === "all" || e.kind === kind) && e.people.some((p) => visible.has(p))),
    [graph, visible, kind],
  );

  const when = (inDays: number, on: string) =>
    inDays === 0 ? "Today" : inDays === 1 ? "Tomorrow" : `In ${inDays} days · ${new Date(on + "T00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}`;

  const page = events.slice(0, shown);
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-xl border border-black/10 p-3 dark:border-white/15">
        <h2 className="font-semibold">Coming up · next 30 days</h2>
        {reminders.length === 0 ? (
          <p className="text-sm opacity-70">Nothing in the next 30 days. Add exact birth and marriage dates to get reminders.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/10">
            {reminders.map((r, i) => (
              <li key={i}>
                <button type="button" onClick={() => onOpen(r.people[0])} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
                  <span className="text-xl" aria-hidden>{ICON[r.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {r.kind === "birthday" && `${name(r.people[0])} turns ${r.years}`}
                      {r.kind === "anniversary" && `${name(r.people[0])} & ${name(r.people[1])}: ${ordinal(r.years)} anniversary`}
                      {r.kind === "remembrance" && `Remembering ${name(r.people[0])} · ${r.years} years`}
                    </span>
                    <span className="block text-xs opacity-60">{when(r.inDays, r.on)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.id} aria-pressed={kind === f.id} onClick={() => { setKind(f.id); setShown(PAGE); }}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm ${kind === f.id ? "border-brand bg-brand/15 font-medium text-brand" : "border-black/15 dark:border-white/20"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <p className="p-4 text-center text-sm opacity-70">No dated events yet. Add birth, marriage and death dates on the profiles.</p>
      ) : (
        <ol className="flex flex-col">
          {page.map((e, i) => {
            const header = i === 0 || page[i - 1].year !== e.year;
            return (
              <li key={i} style={{ contentVisibility: "auto", containIntrinsicSize: "56px" }}>
                {header && <p className="mt-3 border-b border-black/10 pb-1 text-sm font-bold text-brand dark:border-white/15">{e.year}</p>}
                <button type="button" onClick={() => onOpen(e.people[0])} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
                  <span className="text-xl" aria-hidden>{ICON[e.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {e.kind === "birth" && <><b>{name(e.people[0])}</b> was born</>}
                      {e.kind === "death" && <><b>{name(e.people[0])}</b> passed away</>}
                      {e.kind === "marriage" && <><b>{name(e.people[0])}</b> &amp; <b>{name(e.people[1])}</b> married</>}
                    </span>
                    <span className="block text-xs opacity-60">{e.date ? formatDate(e.date, "exact") : e.approx ? `around ${e.year}` : String(e.year)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {events.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="min-h-12 rounded-lg border border-black/15 text-sm dark:border-white/20">
          Show more ({events.length - shown} left)
        </button>
      )}
    </div>
  );
}
