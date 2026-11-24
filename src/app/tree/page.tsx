"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

const FamilyTree = dynamic(() => import("@/modules/family-tree"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <FamilyTree />;
}
