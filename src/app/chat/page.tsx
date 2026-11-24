"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

const Chat = dynamic(() => import("@/modules/chat"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <Chat />;
}
