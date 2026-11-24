"use client";

import { sb } from "./supabase";
import { buildGraph, type Graph } from "./graph";

// In-memory cache of the family graph. Tree -> profile -> back costs
// one download, not three. Any edit calls invalidateGraph().
const cache = new Map<string, { graph: Graph; at: number }>();
const MAX_AGE = 60_000;

export async function getGraph(familyId: string, force = false): Promise<Graph> {
  const hit = cache.get(familyId);
  if (!force && hit && Date.now() - hit.at < MAX_AGE) return hit.graph;
  const { data, error } = await sb().rpc("family_graph", { p_family_id: familyId });
  if (error) throw error;
  const graph = buildGraph(data);
  cache.set(familyId, { graph, at: Date.now() });
  return graph;
}

export function invalidateGraph(familyId: string) {
  cache.delete(familyId);
}
