import type { Relation, Side } from "@/modules/relations/engine";

// Round view: you in the middle, closer relatives on inner rings.
// Father's side on the left, mother's side on the right, spouse's family on
// top, your own children and brothers and sisters at the bottom.

export const NODE = 22; // circle radius
export const RING_GAP = 96;
const SPACING = 64; // min distance between neighbours along a ring

export interface Dot {
  id: string;
  x: number;
  y: number;
  ring: number;
  side: Side;
}

export interface RoundLayout {
  dots: Dot[];
  radii: number[];
  size: number; // width = height
}

// angle ranges in degrees, 0 = top, clockwise
const SECTOR: Record<Exclude<Side, "self">, [number, number]> = {
  inlaw: [-32, 32],
  maternal: [56, 128],
  own: [152, 208],
  paternal: [232, 304],
  other: [328, 346],
};

/** Closeness: 1 = parents, spouse, brothers, sisters, children. 4 = everyone further out. */
export const ringOf = (rel: Relation): number => Math.min(4, Math.max(1, rel.chain.length));

export function layoutRound(people: { id: string; rel: Relation; age?: number | null }[]): RoundLayout {
  const groups = new Map<string, typeof people>();
  for (const p of people) {
    if (p.rel.side === "self") continue;
    const key = `${ringOf(p.rel)}|${p.rel.side}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  // Radius per ring: big enough that the busiest sector isn't crowded.
  const radii = [0, RING_GAP, RING_GAP * 2, RING_GAP * 3, RING_GAP * 4];
  for (const [key, list] of groups) {
    const [ring, side] = key.split("|") as [string, Exclude<Side, "self">];
    const [a, b] = SECTOR[side];
    const arc = ((b - a) * Math.PI) / 180;
    const need = (list.length * SPACING) / arc;
    radii[Number(ring)] = Math.max(radii[Number(ring)], need);
  }
  // keep rings in order and apart
  for (let r = 1; r < radii.length; r++) radii[r] = Math.max(radii[r], radii[r - 1] + RING_GAP * 0.8);

  const dots: Dot[] = [];
  for (const [key, list] of groups) {
    const [ringS, side] = key.split("|") as [string, Exclude<Side, "self">];
    const ring = Number(ringS);
    const [a, b] = SECTOR[side];
    // elders first, so a sector reads from older to younger around the circle
    const sorted = [...list].sort((x, y) => (y.age ?? -1) - (x.age ?? -1) || x.id.localeCompare(y.id));
    sorted.forEach((p, i) => {
      const t = sorted.length === 1 ? 0.5 : i / (sorted.length - 1);
      const deg = a + (b - a) * (sorted.length === 1 ? 0.5 : 0.04 + 0.92 * t);
      const rad = (deg * Math.PI) / 180;
      dots.push({ id: p.id, ring, side, x: Math.sin(rad) * radii[ring], y: -Math.cos(rad) * radii[ring] });
    });
  }

  const reach = Math.max(...radii.slice(1, 1 + Math.max(0, ...dots.map((d) => d.ring))), 0);
  const size = (reach + NODE + 56) * 2;
  return { dots, radii, size: Math.max(size, 320) };
}
