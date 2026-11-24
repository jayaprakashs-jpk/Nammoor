"use client";

import { useCallback, useEffect, useState } from "react";
import { sb } from "./supabase";
import { readLocal, writeLocal } from "./storage";
import type { RelationStyle } from "@/modules/relations/engine";

const KEY = "nammoor.relationStyle";
const STYLES: RelationStyle[] = ["tamil", "english_in", "english_global"];
const valid = (v: string | null): v is RelationStyle => !!v && (STYLES as string[]).includes(v);

/** How relation names are shown (Tamil, Hindi style, English). Saved on the profile, cached for speed. */
export function useRelationStyle(userId: string): [RelationStyle, (s: RelationStyle) => void] {
  const [style, setStyle] = useState<RelationStyle>(() => {
    const saved = readLocal(KEY);
    return valid(saved) ? saved : "tamil";
  });

  useEffect(() => {
    let alive = true;
    sb()
      .from("profiles")
      .select("relation_style")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data && valid(data.relation_style)) {
          setStyle(data.relation_style);
          writeLocal(KEY, data.relation_style);
        }
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const change = useCallback(
    (s: RelationStyle) => {
      setStyle(s);
      writeLocal(KEY, s);
      sb().from("profiles").update({ relation_style: s }).eq("id", userId).then(() => {});
    },
    [userId],
  );

  return [style, change];
}
