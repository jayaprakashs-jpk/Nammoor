"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

// Security settings (linking, password, devices, App Lock) download only when opened.
const Security = dynamic(() => import("@/modules/security"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <Security />;
}
