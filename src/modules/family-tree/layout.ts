import { byAge, parentsOf, spousesOf, type Graph } from "@/shared/lib/graph";

// Layout for the hierarchical tree: one row per generation, couples side by
// side, children under their parents. Pure maths, no DOM, so it is testable.

export const CARD = { w: 96, h: 70, gap: 14, pair: 6, vgap: 56, pad: 16 };

export interface Box {
  id: string;
  x: number;
  y: number;
  row: number;
}

export interface TreeLayout {
  boxes: Map<string, Box>;
  /** SVG path data: child up to its parents. */
  links: string[];
  /** Short line between two partners. */
  couples: { x1: number; x2: number; y: number }[];
  width: number;
  height: number;
}

interface Unit {
  ids: string[];
  row: number;
  x: number; // left edge
  w: number;
}

const unitWidth = (n: number) => n * CARD.w + (n - 1) * CARD.pair;

export function layoutTree(g: Graph, include: Set<string>, levels: Map<string, number>): TreeLayout {
  const empty: TreeLayout = { boxes: new Map(), links: [], couples: [], width: 0, height: 0 };
  if (!include.size) return empty;

  // 1. rows
  const rowLevels = [...new Set([...include].map((id) => levels.get(id) ?? 0))].sort((a, b) => a - b);
  const rowOf = new Map<string, number>();
  for (const id of include) rowOf.set(id, rowLevels.indexOf(levels.get(id) ?? 0));
  const rows: string[][] = rowLevels.map(() => []);
  for (const id of include) rows[rowOf.get(id)!].push(id);

  // 2. units: partners in the same row stay together
  const cmp = byAge(g);
  const unitsByRow: Unit[][] = rows.map((ids, row) => {
    const parent = new Map<string, string>(ids.map((i) => [i, i]));
    const find = (i: string): string => (parent.get(i) === i ? i : (parent.set(i, find(parent.get(i)!)), parent.get(i)!));
    for (const id of ids)
      for (const s of spousesOf(g, id))
        if (include.has(s.id) && rowOf.get(s.id) === row) parent.set(find(id), find(s.id));
    const groups = new Map<string, string[]>();
    for (const id of ids) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
    return [...groups.values()].map((m) => ({ ids: m.sort(cmp), row, x: 0, w: unitWidth(m.length) }));
  });

  // 3. order each row by where the parents ended up (keeps siblings together)
  const index = new Map<string, number>();
  unitsByRow.forEach((units) => {
    const key = (u: Unit) => {
      const ps = u.ids.flatMap((id) => parentsOf(g, id)).filter((p) => index.has(p));
      return ps.length ? ps.reduce((a, p) => a + index.get(p)!, 0) / ps.length : Infinity;
    };
    const keys = new Map(units.map((u) => [u, key(u)]));
    units.sort((a, b) => keys.get(a)! - keys.get(b)! || cmp(a.ids[0], b.ids[0]));
    units.forEach((u, i) => u.ids.forEach((id) => index.set(id, i)));
  });

  // 4. x positions: left to right, then pull parents over their children
  const place = (units: Unit[], desired?: Map<Unit, number>) => {
    let right = -Infinity;
    for (const u of units) {
      const want = desired?.get(u);
      const left = want === undefined ? (right === -Infinity ? 0 : right + CARD.gap) : want - u.w / 2;
      u.x = right === -Infinity ? left : Math.max(left, right + CARD.gap);
      right = u.x + u.w;
    }
  };
  const last = unitsByRow.length - 1;
  place(unitsByRow[last]);
  const unitOf = new Map<string, Unit>();
  unitsByRow.forEach((us) => us.forEach((u) => u.ids.forEach((id) => unitOf.set(id, u))));
  for (let r = last - 1; r >= 0; r--) {
    const desired = new Map<Unit, number>();
    for (const u of unitsByRow[r]) {
      const kids = new Set<Unit>();
      for (const id of u.ids)
        for (const c of g.childrenOf.get(id) ?? []) {
          const cu = unitOf.get(c);
          if (cu && cu.row === r + 1) kids.add(cu);
        }
      if (kids.size) desired.set(u, [...kids].reduce((a, k) => a + k.x + k.w / 2, 0) / kids.size);
    }
    // units without children keep their natural slot after their left neighbour
    let cursor = -Infinity;
    for (const u of unitsByRow[r]) {
      const want = desired.get(u);
      const left = want !== undefined ? want - u.w / 2 : cursor === -Infinity ? 0 : cursor + CARD.gap;
      u.x = cursor === -Infinity ? left : Math.max(left, cursor + CARD.gap);
      cursor = u.x + u.w;
    }
  }

  // 5. shift so everything is inside the canvas
  const minX = Math.min(...unitsByRow.flat().map((u) => u.x));
  const boxes = new Map<string, Box>();
  for (const u of unitsByRow.flat()) {
    u.ids.forEach((id, i) => {
      boxes.set(id, { id, row: u.row, x: u.x - minX + CARD.pad + i * (CARD.w + CARD.pair), y: CARD.pad + u.row * (CARD.h + CARD.vgap) });
    });
  }

  // 6. lines
  const links: string[] = [];
  const couples: TreeLayout["couples"] = [];
  const cx = (b: Box) => b.x + CARD.w / 2;
  for (const u of unitsByRow.flat())
    for (let i = 0; i + 1 < u.ids.length; i++) {
      const a = boxes.get(u.ids[i])!;
      const b = boxes.get(u.ids[i + 1])!;
      couples.push({ x1: a.x + CARD.w, x2: b.x, y: a.y + CARD.h / 2 });
    }
  for (const id of include) {
    const c = boxes.get(id)!;
    const ps = parentsOf(g, id).filter((p) => boxes.has(p));
    if (!ps.length) continue;
    const midY = c.y - CARD.vgap / 2;
    const done = new Set<string>();
    for (const p of ps) {
      if (done.has(p)) continue;
      const pb = boxes.get(p)!;
      const mate = ps.find((q) => q !== p && !done.has(q) && boxes.get(q)!.row === pb.row && unitOf.get(q) === unitOf.get(p));
      done.add(p);
      if (mate) {
        done.add(mate);
        const mb = boxes.get(mate)!;
        const ax = (cx(pb) + cx(mb)) / 2;
        links.push(`M${cx(c)},${c.y} V${midY} H${ax} V${pb.y + CARD.h / 2}`);
      } else {
        links.push(`M${cx(c)},${c.y} V${midY} H${cx(pb)} V${pb.y + CARD.h}`);
      }
    }
  }

  const all = [...boxes.values()];
  return {
    boxes,
    links,
    couples,
    width: Math.max(...all.map((b) => b.x)) + CARD.w + CARD.pad,
    height: Math.max(...all.map((b) => b.y)) + CARD.h + CARD.pad,
  };
}
