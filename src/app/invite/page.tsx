"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

const Invites = dynamic(() => import("@/modules/invites"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <Invites />;
}
