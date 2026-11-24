"use client";

import { useEffect, useMemo, useRef } from "react";
import { labelFor } from "@/modules/relations/engine";
import { ageFrom } from "@/shared/lib/age";
import { ancestorSlots, layoutPedigree, PED } from "../ancestors";
import { SIDE_COLOR, short, type ViewProps } from "./types";

// Direct ancestors only. You on the left, parents to the right, and so on.
export default function PedigreeView({ graph, ego, rels, style, depth, canEdit, onOpen, onQuickAdd }: ViewProps) {
  const d = Math.min(depth, 6); // 6 generations = 32 rows already
  const layout = useMemo(() => (ego ? layoutPedigree(ancestorSlots(graph, ego, d), d) : null), [graph, ego, d]);
  const box = useRef<HTMLDivElement>(null);
  // open with you in view, not at the top of the chart
  useEffect(() => {
    const el = box.current;
    const me = layout?.nodes.find((n) => n.slot === 1);
    if (el && me) el.scrollTop = Math.max(0, me.y + PED.h / 2 - el.clientHeight / 2);
  }, [layout]);
  if (!ego || !layout) return <p className="p-4 text-center text-sm opacity-70">Pick who you are to see the pedigree.</p>;

  return (
    <div ref={box} className="h-[70vh] overflow-auto rounded-xl border border-black/10 dark:border-white/15">
      <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Pedigree chart">
        <g fill="none" className="stroke-stone-400 dark:stroke-stone-600" strokeWidth={1.5}>
          {layout.links.map((p, i) => <path key={i} d={p} />)}
        </g>
        {layout.nodes.map((n) => {
          if (n.placeholder) {
            const child = n.childId!;
            if (!canEdit(child)) return null;
            const childName = graph.persons.get(child)?.name ?? "";
            return (
              <g key={n.slot} transform={`translate(${n.x},${n.y})`} role="button" tabIndex={0} className="cursor-pointer"
                aria-label={`Add ${n.role} of ${childName}`}
                onClick={() => onQuickAdd(child, n.role!)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onQuickAdd(child, n.role!)}>
                <rect width={PED.w} height={PED.h} rx={10} fill="none" strokeDasharray="5 4" className="stroke-brand" strokeWidth={1.5} />
                <text x={PED.w / 2} y={PED.h / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={600} className="fill-brand">
                  + Add {n.role === "father" ? "Father" : "Mother"}
                </text>
              </g>
            );
          }
          const p = graph.persons.get(n.id!)!;
          const rel = rels.get(n.id!);
          const color = SIDE_COLOR[rel?.side ?? "other"];
          const title = n.slot === 1 ? "You" : labelFor(rel, style).title;
          const years = ageFrom(p.dob, p.dobp, { deathDate: p.dod });
          const born = p.dob && p.dobp !== "unknown" ? p.dob.slice(0, 4) : "";
          const died = !p.alive ? (p.dod ? p.dod.slice(0, 4) : "†") : "";
          return (
            <g key={n.slot} transform={`translate(${n.x},${n.y})`} role="link" tabIndex={0} className="cursor-pointer"
              aria-label={`${p.name}${title ? `, ${title}` : ""}`}
              onClick={() => onOpen(p.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(p.id)}>
              <rect width={PED.w} height={PED.h} rx={10} className="fill-white stroke-black/15 dark:fill-stone-900 dark:stroke-white/20" strokeWidth={n.slot === 1 ? 3 : 1}
                style={n.slot === 1 ? { stroke: color.fill } : undefined} />
              <rect width={6} height={PED.h} rx={3} fill={color.fill} />
              <text x={14} y={20} fontSize={12.5} fontWeight={600} className="fill-current">{short(p.name, 19)}</text>
              <text x={14} y={36} fontSize={10.5} fill={color.fill} fontWeight={600}>{short(title, 12)}</text>
              <text x={PED.w - 8} y={36} fontSize={10} textAnchor="end" className="fill-current" opacity={0.65}>
                {born || died ? `${born}${died ? `–${died}` : ""}` : years ? `${years.years}y` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
