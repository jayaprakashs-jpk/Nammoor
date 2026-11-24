"use client";

import dynamic from "next/dynamic";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";

// Backup code (file formats, GEDCOM, native plugins) downloads only when this screen opens.
const Backup = dynamic(() => import("@/modules/backup"), { ssr: false, loading: ModuleLoading });

export default function Page() {
  return <Backup />;
}
