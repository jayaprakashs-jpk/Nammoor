import type { Graph } from "@/shared/lib/graph";

// Ahnentafel numbering, the standard for pedigree charts:
//   slot 1 = the person, slot 2n = father of slot n, slot 2n+1 = mother of slot n.
// So generation k holds slots 2^k .. 2^(k+1)-1, fathers' lines to the left.

export const MAX_DEPTH = 7;

export type Slots = Map<number, string | null>;

/** Father and mother of someone. Biological parents first; gender decides which is which. */
export function parentPair(g: Graph, id: string): [string | null, string | null] {
  const ps = (g.parentsOf.get(id) ?? []).slice().sort((a, b) => Number(a.kind !== "biological") - Number(b.kind !== "biological") || a.id.localeCompare(b.id));
  let father: string | null = null;
  let mother: string | null = null;
  for (const p of ps) {
    const gender = g.persons.get(p.id)?.g;
    if (gender === "male" && !father) father = p.id;
    else if (gender === "female" && !mother) mother = p.id;
  }
  // unknown gender: fill whichever place is still free
  for (const p of ps) {
    if (p.id === father || p.id === mother) continue;
    if (!father) father = p.id;
    else if (!mother) mother = p.id;
  }
  return [father, mother];
}

/**
 * Ancestors of `ego` for `depth` generations (depth 1 = just the person).
 * A missing slot is null. If the same person appears twice (cousin marriage)
 * they appear in both places, which is how pedigree charts show it.
 */
export function ancestorSlots(g: Graph, ego: string, depth: number): Slots {
  const d = Math.max(1, Math.min(MAX_DEPTH, depth));
  const slots: Slots = new Map();
  if (!g.persons.has(ego)) return slots;
  slots.set(1, ego);
  for (let n = 1; n < 2 ** (d - 1); n++) {
    const id = slots.get(n);
    const [f, m] = id ? parentPair(g, id) : [null, null];
    slots.set(2 * n, f);
    slots.set(2 * n + 1, m);
  }
  return slots;
}

export const generationOfSlot = (slot: number) => Math.floor(Math.log2(slot));

// ---------- pedigree chart (horizontal: you on the left, ancestors to the right) ----------

export const PED = { w: 150, h: 50, colGap: 36, rowGap: 10, pad: 12 };

export interface PedNode {
  slot: number;
  id: string | null;
  /** Empty slot whose child exists: a "+ Add" card goes here. */
  placeholder: boolean;
  /** Who the placeholder would be a parent of. */
  childId: string | null;
  role: "father" | "mother" | null;
  x: number;
  y: number;
}

export function layoutPedigree(slots: Slots, depth: number): { nodes: PedNode[]; links: string[]; width: number; height: number } {
  const d = Math.max(1, Math.min(MAX_DEPTH, depth));
  const rows = 2 ** (d - 1);
  const rowH = PED.h + PED.rowGap;
  const height = rows * rowH + PED.pad * 2 - PED.rowGap;
  const width = d * PED.w + (d - 1) * PED.colGap + PED.pad * 2;
  const nodes: PedNode[] = [];
  const at = new Map<number, PedNode>();

  for (const [slot, id] of slots) {
    const k = generationOfSlot(slot);
    const i = slot - 2 ** k;
    const node: PedNode = {
      slot,
      id,
      placeholder: false,
      childId: null,
      role: slot > 1 ? (slot % 2 === 0 ? "father" : "mother") : null,
      x: PED.pad + k * (PED.w + PED.colGap),
      // the middle of this slot's share of the height
      y: PED.pad + (i + 0.5) * ((height - PED.pad * 2) / 2 ** k) - PED.h / 2,
    };
    if (!id && slot > 1) {
      const child = slots.get(slot >> 1) ?? null;
      if (child) {
        node.placeholder = true;
        node.childId = child;
      }
    }
    nodes.push(node);
    at.set(slot, node);
  }
  // an empty slot only shows if it is a placeholder (nothing hangs off a missing person)
  const shown = nodes.filter((n) => n.id || n.placeholder);
  const links: string[] = [];
  for (const n of shown) {
    if (n.slot === 1) continue;
    const child = at.get(n.slot >> 1)!;
    if (!child.id) continue;
    const x1 = child.x + PED.w;
    const y1 = child.y + PED.h / 2;
    const x2 = n.x;
    const y2 = n.y + PED.h / 2;
    const mid = x1 + PED.colGap / 2;
    links.push(`M${x1},${y1} H${mid} V${y2} H${x2}`);
  }
  return { nodes: shown, links, width, height };
}

// ---------- fan chart (semicircle) ----------

export const FAN = { centre: 44, ring: 62, pad: 14 };

export interface FanSegment {
  slot: number;
  id: string | null;
  ring: number;
  path: string;
  /** Where the label goes. */
  tx: number;
  ty: number;
  /** Label rotation in degrees. */
  rot: number;
  /** Length of the segment along its middle, in pixels: tells us if a name fits. */
  arc: number;
}

export function layoutFan(slots: Slots, depth: number): { segments: FanSegment[]; width: number; height: number; cx: number; cy: number } {
  const d = Math.max(1, Math.min(MAX_DEPTH, depth));
  const outer = FAN.centre + (d - 1) * FAN.ring;
  const cx = outer + FAN.pad;
  const cy = outer + FAN.pad;
  const pt = (r: number, phi: number) => [cx - r * Math.cos(phi), cy - r * Math.sin(phi)] as const;
  const segments: FanSegment[] = [];

  for (const [slot, id] of slots) {
    const ring = generationOfSlot(slot);
    if (ring === 0) continue;
    const i = slot - 2 ** ring;
    const n = 2 ** ring;
    const p0 = (i * Math.PI) / n;
    const p1 = ((i + 1) * Math.PI) / n;
    const r0 = FAN.centre + (ring - 1) * FAN.ring;
    const r1 = r0 + FAN.ring;
    const [ax, ay] = pt(r1, p0);
    const [bx, by] = pt(r1, p1);
    const [ccx, ccy] = pt(r0, p1);
    const [ddx, ddy] = pt(r0, p0);
    const path = `M${ax.toFixed(1)},${ay.toFixed(1)} A${r1},${r1} 0 0 1 ${bx.toFixed(1)},${by.toFixed(1)} L${ccx.toFixed(1)},${ccy.toFixed(1)} A${r0},${r0} 0 0 0 ${ddx.toFixed(1)},${ddy.toFixed(1)} Z`;
    const rm = (r0 + r1) / 2;
    const pm = (p0 + p1) / 2;
    const [tx, ty] = pt(rm, pm);
    // Inner rings: horizontal text. Outer rings: along the radius, never upside down.
    let rot = 0;
    if (ring >= 3) {
      rot = (Math.atan2(ty - cy, tx - cx) * 180) / Math.PI;
      if (tx < cx) rot += 180;
    }
    segments.push({ slot, id, ring, path, tx, ty, rot, arc: rm * (p1 - p0) });
  }
  return { segments, width: cx * 2, height: cy + FAN.pad + 24, cx, cy };
}
