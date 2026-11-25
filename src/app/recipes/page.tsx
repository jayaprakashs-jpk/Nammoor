"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

// Recipes load only when this screen opens.
const Recipes = dynamic(() => import("@/modules/recipes"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <Recipes />;
}
