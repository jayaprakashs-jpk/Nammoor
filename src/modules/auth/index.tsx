"use client";

import { ModuleShell } from "@/shared/ui/ModuleShell";

// Entry point of the auth module. Loaded with next/dynamic, so none of this
// module's code is downloaded until its screen is opened.
export default function AuthModule() {
  return <ModuleShell title="Sign in" note="Module loaded on demand. Phase 1 UI comes after approval." />;
}
