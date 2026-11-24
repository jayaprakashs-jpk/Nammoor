"use client";

import { useEffect, useMemo, useRef } from "react";
import { labelFor } from "@/modules/relations/engine";
import { ancestorSlots, FAN, layoutFan } from "../ancestors";
import { SIDE_COLOR, initials, short, type ViewProps } from "./types";

// Semicircle of ancestors: fathers' side on the left, mothers' side on the right.
export default function FanView({ graph, ego, rels, style, depth, onOpen }: ViewProps) {
  const layout = useMemo(() => (ego ? layoutFan(ancestorSlots(graph, ego, depth), depth) : null), [graph, ego, depth]);
  const slots = useMemo(() => (ego ? ancestorSlots(graph, ego, depth) : null), [graph, ego, depth]);
  const box = useRef<HTMLDivElement>(null);
  // open with you in the middle of the screen
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, [layout]);
  if (!ego || !layout || !slots) return <p className="p-4 text-center text-sm opacity-70">Pick who you are to see the fan.</p>;
  const me = graph.persons.get(ego)!;

  return (
    <div ref={box} className="overflow-auto rounded-xl border border-black/10 dark:border-white/15">
      <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Fan chart of ancestors" className="block min-w-full">
        {layout.segments.map((s) => {
          const p = s.id ? graph.persons.get(s.id) : null;
          if (!p) return <path key={s.slot} d={s.path} fill="none" strokeDasharray="3 4" className="stroke-stone-300 dark:stroke-stone-700" />;
          const rel = rels.get(p.id);
          const color = SIDE_COLOR[rel?.side ?? "other"];
          const title = labelFor(rel, style).title;
          const showName = s.arc >= 13;
          const two = s.ring <= 2;
          return (
            <g key={s.slot} role="link" tabIndex={0} className="cursor-pointer" aria-label={`${p.name}, ${title}`}
              onClick={() => onOpen(p.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(p.id)}>
              <path d={s.path} fill={color.fill} opacity={p.alive ? 0.92 - s.ring * 0.06 : 0.5} stroke="#fff" strokeWidth={1.5} />
              {showName && (
                <text transform={`translate(${s.tx},${s.ty}) rotate(${s.rot})`} textAnchor="middle" fill="#fff" fontSize={two ? 11 : 9.5} fontWeight={600}>
                  <tspan x={0} dy={two ? -3 : 3}>{short(p.name, two ? 13 : Math.max(5, Math.floor(FAN.ring / 6)))}</tspan>
                  {two && <tspan x={0} dy={13} fontSize={10} fontWeight={500}>{short(title, 13)}</tspan>}
                </text>
              )}
            </g>
          );
        })}
        <g role="link" tabIndex={0} className="cursor-pointer" onClick={() => onOpen(ego)} onKeyDown={(e) => e.key === "Enter" && onOpen(ego)} aria-label={`${me.name}, You`}>
          <circle cx={layout.cx} cy={layout.cy} r={FAN.centre - 4} fill={SIDE_COLOR.self.fill} />
          <text x={layout.cx} y={layout.cy - 6} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={700}>{initials(me.name)}</text>
          <text x={layout.cx} y={layout.cy + 10} textAnchor="middle" fill="#fff" fontSize={9.5}>{short(me.name, 11)}</text>
        </g>
      </svg>
      <p className="px-3 pb-3 text-center text-xs opacity-60">Father&apos;s side on the left, mother&apos;s side on the right. Tap a person to open.</p>
    </div>
  );
}
