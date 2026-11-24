"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

const Auth = dynamic(() => import("@/modules/auth"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <Auth />;
}
