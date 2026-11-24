"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Signed-in people go straight to their tree. We only peek at the saved
// session key, so the home page never loads the Supabase library.
export function HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    try {
      const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
      if (window.localStorage.getItem(`sb-${ref}-auth-token`)) router.replace("/tree/");
    } catch {
      /* no storage or bad URL: stay on home */
    }
  }, [router]);
  return null;
}
