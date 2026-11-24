"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { labelFor } from "@/modules/relations/engine";
import { CARD, layoutTree } from "../layout";
import { SIDE_COLOR, initials, short, type ViewProps } from "./types";

export default function ChartView({ graph, ego, rels, levels, style, visible, onOpen }: ViewProps) {
  const layout = useMemo(() => layoutTree(graph, visible, levels), [graph, visible, levels]);
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);

  // Start with you in the middle of the screen.
  useEffect(() => {
    const el = box.current;
    const me = ego ? layout.boxes.get(ego) : null;
    if (!el || !me) return;
    el.scrollLeft = Math.max(0, (me.x + CARD.w / 2) * zoom - el.clientWidth / 2);
    el.scrollTop = Math.max(0, (me.y + CARD.h / 2) * zoom - el.clientHeight / 2);
    // only when the picture changes, not on every zoom tap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, ego]);

  if (!layout.boxes.size) return <p className="p-4 text-center text-sm opacity-70">Nobody to show here.</p>;

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        {[["−", -0.2], ["+", 0.2]].map(([t, d]) => (
          <button key={t as string} type="button" aria-label={t === "+" ? "Zoom in" : "Zoom out"}
            onClick={() => setZoom((z) => Math.min(1.6, Math.max(0.5, +(z + (d as number)).toFixed(2))))}
            className="h-10 w-10 rounded-full border border-black/15 bg-background/90 text-xl dark:border-white/20">{t}</button>
        ))}
      </div>
      <div ref={box} className="h-[70vh] overflow-auto rounded-xl border border-black/10 dark:border-white/15">
        <svg width={layout.width * zoom} height={layout.height * zoom} viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img" aria-label="Family tree">
          <g fill="none" className="stroke-stone-400 dark:stroke-stone-600" strokeWidth={1.5}>
            {layout.links.map((d, i) => <path key={i} d={d} />)}
            {layout.couples.map((c, i) => <line key={i} x1={c.x1} x2={c.x2} y1={c.y} y2={c.y} strokeWidth={3} />)}
          </g>
          {[...layout.boxes.values()].map((b) => {
            const p = graph.persons.get(b.id)!;
            const rel = rels.get(b.id);
            const color = SIDE_COLOR[rel?.side ?? "other"];
            const title = b.id === ego ? "You" : labelFor(rel, style).title;
            return (
              <g key={b.id} transform={`translate(${b.x},${b.y})`} className="cursor-pointer" role="link" tabIndex={0}
                aria-label={`${p.name}${title ? `, ${title}` : ""}`}
                onClick={() => onOpen(b.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(b.id)}>
                <rect width={CARD.w} height={CARD.h} rx={10} className="fill-white stroke-black/15 dark:fill-stone-900 dark:stroke-white/20"
                  strokeWidth={b.id === ego ? 3 : 1} style={b.id === ego ? { stroke: color.fill } : undefined} />
                <circle cx={CARD.w / 2} cy={19} r={13} fill={color.fill} />
                <text x={CARD.w / 2} y={23} textAnchor="middle" fontSize={11} fontWeight={600} fill={color.text}>{initials(p.name)}</text>
                <text x={CARD.w / 2} y={46} textAnchor="middle" fontSize={11} className="fill-current">
                  {short(p.name, 13)}{p.alive ? "" : " †"}
                </text>
                <text x={CARD.w / 2} y={62} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={color.fill}>{short(title, 14)}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
