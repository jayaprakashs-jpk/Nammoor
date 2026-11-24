import type { Graph } from "@/shared/lib/graph";
import type { Relation, RelationStyle } from "@/modules/relations/engine";

export interface ViewProps {
  graph: Graph;
  /** Whose point of view the names are from. */
  ego: string | null;
  rels: Map<string, Relation>;
  levels: Map<string, number>;
  style: RelationStyle;
  /** People to show (the side filter and search already applied). */
  visible: Set<string>;
  onOpen: (id: string) => void;
}

export const SIDE_COLOR = {
  self: { fill: "#b45309", text: "#ffffff", label: "You" },
  paternal: { fill: "#0369a1", text: "#ffffff", label: "Father's side" },
  maternal: { fill: "#be185d", text: "#ffffff", label: "Mother's side" },
  inlaw: { fill: "#047857", text: "#ffffff", label: "Spouse's family" },
  own: { fill: "#b45309", text: "#ffffff", label: "Own line" },
  other: { fill: "#57534e", text: "#ffffff", label: "Other" },
} as const;

export const initials = (name: string) =>
  name.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
