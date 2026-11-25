"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

// Merge requests load only when this screen opens.
const Merge = dynamic(() => import("@/modules/merge"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <Merge />;
}
