"use client";

import { useEffect, useMemo, useRef } from "react";
import { labelFor } from "@/modules/relations/engine";
import { ageFrom } from "@/shared/lib/age";
import { NODE, layoutRound } from "../round";
import { SIDE_COLOR, initials, short, type ViewProps } from "./types";

export default function RoundView({ graph, ego, rels, style, visible, onOpen }: ViewProps) {
  const layout = useMemo(
    () =>
      layoutRound(
        [...visible]
          .filter((id) => id !== ego && rels.has(id))
          .map((id) => {
            const p = graph.persons.get(id)!;
            return { id, rel: rels.get(id)!, age: ageFrom(p.dob, p.dobp, { deathDate: p.dod })?.years ?? null };
          }),
      ),
    [graph, visible, rels, ego],
  );
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    }
  }, [layout]);

  if (!ego) return <p className="p-4 text-center text-sm opacity-70">Pick who you are to see the round view.</p>;
  const me = graph.persons.get(ego)!;
  const c = layout.size / 2;

  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className="h-[70vh] overflow-auto rounded-xl border border-black/10 dark:border-white/15">
        <svg width={layout.size} height={layout.size} viewBox={`0 0 ${layout.size} ${layout.size}`} role="img" aria-label="Round family view">
          <g transform={`translate(${c},${c})`}>
            {layout.radii.slice(1).map((r, i) =>
              layout.dots.some((d) => d.ring === i + 1) ? (
                <circle key={i} r={r} fill="none" strokeDasharray="4 6" className="stroke-stone-300 dark:stroke-stone-700" />
              ) : null,
            )}
            <g role="link" tabIndex={0} className="cursor-pointer" onClick={() => onOpen(ego)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(ego)} aria-label={`${me.name}, You`}>
              <circle r={NODE + 8} fill={SIDE_COLOR.self.fill} />
              <text textAnchor="middle" y={5} fontSize={14} fontWeight={700} fill="#fff">{initials(me.name)}</text>
              <text textAnchor="middle" y={NODE + 24} fontSize={11} className="fill-current">{short(me.name, 14)}</text>
            </g>
            {layout.dots.map((d) => {
              const p = graph.persons.get(d.id)!;
              const color = SIDE_COLOR[d.side];
              const title = labelFor(rels.get(d.id), style).title;
              return (
                <g key={d.id} transform={`translate(${d.x},${d.y})`} role="link" tabIndex={0} className="cursor-pointer"
                  aria-label={`${p.name}, ${title}`} onClick={() => onOpen(d.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(d.id)}>
                  <circle r={NODE} fill={color.fill} opacity={p.alive ? 1 : 0.6} />
                  <text textAnchor="middle" y={4} fontSize={11} fontWeight={600} fill="#fff">{initials(p.name)}</text>
                  <text textAnchor="middle" y={NODE + 12} fontSize={9.5} className="fill-current">{short(p.name, 12)}</text>
                  <text textAnchor="middle" y={NODE + 23} fontSize={9.5} fontWeight={600} fill={color.fill}>{short(title, 14)}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {(["paternal", "maternal", "inlaw", "own"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: SIDE_COLOR[s].fill }} />
            {SIDE_COLOR[s].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
