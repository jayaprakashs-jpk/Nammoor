"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { sb } from "./supabase";

/** Current login. `loading` is true until the stored session has been read. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    sb()
      .auth.getSession()
      .then(({ data }) => {
        if (!alive) return;
        setSession(data.session);
        setLoading(false);
      });
    const { data } = sb().auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, userId: session?.user.id ?? null, loading };
}

/** Only allow in-app paths like "/tree/". Blocks "//evil.com" and "https://..." */
export function safeNext(next: string | null | undefined, fallback = "/tree/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
