"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

const Profiles = dynamic(() => import("@/modules/profiles"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <Profiles />;
}
