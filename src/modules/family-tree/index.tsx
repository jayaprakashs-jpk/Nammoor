"use client";

import { ModuleShell } from "@/shared/ui/ModuleShell";

// Entry point of the family-tree module. Loaded with next/dynamic, so none of this
// module's code is downloaded until its screen is opened.
export default function FamilyTreeModule() {
  return <ModuleShell title="Family Tree" note="Module loaded on demand. Phase 1 UI comes after approval." />;
}
