"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

// PDF code (painting, PDF writer) downloads only when this screen opens.
const Print = dynamic(() => import("@/modules/print"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <Print />;
}
