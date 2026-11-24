"use client";

import Link from "next/link";
import { byAge } from "@/shared/lib/graph";
import { labelFor, type Atom, type Relation } from "@/modules/relations/engine";
import { Avatar } from "@/shared/ui/Avatar";
import type { ViewProps } from "./types";

const SIB: Atom[] = ["eB", "yB", "B", "eZ", "yZ", "Z", "G"];
const PAR: Atom[] = ["F", "M", "P"];
const KID: Atom[] = ["S", "D", "C"];
const SPO: Atom[] = ["H", "W", "X"];

// The people closest to you, grouped the way families talk about them.
const GROUPS: { title: string; match: (c: Atom[]) => boolean }[] = [
  { title: "Parents · பெற்றோர்", match: (c) => c.length === 1 && PAR.includes(c[0]) },
  { title: "Husband / Wife · துணைவர்", match: (c) => c.length === 1 && SPO.includes(c[0]) },
  { title: "Brothers & sisters · உடன்பிறப்புகள்", match: (c) => c.length === 1 && SIB.includes(c[0]) },
  { title: "Children · பிள்ளைகள்", match: (c) => c.length === 1 && KID.includes(c[0]) },
  { title: "Grandparents · தாத்தா பாட்டி", match: (c) => c.length === 2 && PAR.includes(c[0]) && PAR.includes(c[1]) },
  { title: "Uncles & aunts · சித்தப்பா, மாமா...", match: (c) => c.length === 2 && PAR.includes(c[0]) && SIB.includes(c[1]) },
  { title: "Parents-in-law · மாமனார், மாமியார்", match: (c) => c.length === 2 && SPO.includes(c[0]) && PAR.includes(c[1]) },
  { title: "Grandchildren · பேரப்பிள்ளைகள்", match: (c) => c.length === 2 && KID.includes(c[0]) && KID.includes(c[1]) },
  { title: "Nephews & nieces · மருமக்கள்", match: (c) => c.length === 2 && SIB.includes(c[0]) && KID.includes(c[1]) },
];

export default function CloseView({ graph, rels, style, visible }: ViewProps) {
  const byGroup = GROUPS.map((g) => ({
    ...g,
    ids: [...visible].filter((id) => {
      const r: Relation | undefined = rels.get(id);
      return r && g.match(r.chain);
    }).sort(byAge(graph)),
  })).filter((g) => g.ids.length);

  if (!byGroup.length) return <p className="p-4 text-center text-sm opacity-70">Add your parents, husband or wife, and children to see your close circle.</p>;

  return (
    <>
      {byGroup.map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide opacity-60">{g.title}</h2>
          <div className="grid grid-cols-2 gap-2">
            {g.ids.map((id) => {
              const p = graph.persons.get(id)!;
              const l = labelFor(rels.get(id), style);
              return (
                <Link key={id} href={`/person/?id=${id}`}
                  className="flex flex-col items-center gap-1 rounded-xl border border-black/10 p-3 text-center active:scale-[0.98] dark:border-white/15">
                  <Avatar name={p.name} path={p.photo} size={56} />
                  <span className="text-base font-semibold text-brand">{l.title}</span>
                  <span className="w-full truncate text-sm">{p.name}{p.alive ? "" : " †"}</span>
                  {l.sub && <span className="line-clamp-2 text-[11px] opacity-60">{l.sub}</span>}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
