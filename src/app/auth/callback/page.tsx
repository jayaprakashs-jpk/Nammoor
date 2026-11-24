"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

const Callback = dynamic(() => import("@/modules/auth/Callback"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <Callback />;
}
