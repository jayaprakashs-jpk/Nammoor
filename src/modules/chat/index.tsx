"use client";

import { ModuleShell } from "@/shared/ui/ModuleShell";

// Entry point of the chat module. Loaded with next/dynamic, so none of this
// module's code is downloaded until its screen is opened.
export default function ChatModule() {
  return <ModuleShell title="Family Chat" note="Module loaded on demand. Phase 1 UI comes after approval." />;
}
