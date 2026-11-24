"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/shared/lib/session";
import { ModuleLoading } from "./ModuleLoading";

/** Shows children only when signed in. Otherwise sends to login and back. */
export function RequireAuth({ children }: { children: (userId: string) => ReactNode }) {
  const { userId, loading } = useSession();
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (!loading && !userId) {
      const here = path + (search.toString() ? `?${search}` : "");
      router.replace(`/login/?next=${encodeURIComponent(here)}`);
    }
  }, [loading, userId, path, search, router]);

  if (loading || !userId) return <ModuleLoading />;
  return <>{children(userId)}</>;
}
