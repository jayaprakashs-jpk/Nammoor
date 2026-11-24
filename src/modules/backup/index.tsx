"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { getCurrentFamilyId } from "@/shared/lib/storage";
import { friendlyError } from "@/shared/lib/errors";
import { RequireAuth } from "@/shared/ui/RequireAuth";
import { Header } from "@/shared/ui/Header";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { ErrorText } from "@/shared/ui/form";
import { Export } from "./Export";
import { Import } from "./Import";

export default function BackupModule() {
  return <RequireAuth>{(uid) => <BackupScreen userId={uid} />}</RequireAuth>;
}

function BackupScreen({ userId }: { userId: string }) {
  const familyId = useSearchParams().get("family") ?? getCurrentFamilyId();
  const [info, setInfo] = useState<{ name: string; admin: boolean } | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"export" | "import">("export");

  useEffect(() => {
    if (!familyId) return;
    let alive = true;
    Promise.all([
      sb().from("families").select("name").eq("id", familyId).maybeSingle(),
      sb().from("family_members").select("role").eq("family_id", familyId).eq("user_id", userId).maybeSingle(),
    ]).then(([f, m]) => {
      if (!alive) return;
      const err = f.error || m.error;
      if (err) return setError(friendlyError(err));
      setInfo({ name: f.data?.name ?? "Family", admin: m.data?.role === "owner" || m.data?.role === "admin" });
    });
    return () => {
      alive = false;
    };
  }, [familyId, userId]);

  if (!familyId) return <main className="p-6"><p>Open a family first.</p></main>;
  if (error) return <main className="p-6"><ErrorText>{error}</ErrorText></main>;
  if (!info) return <ModuleLoading />;

  return (
    <div className="flex flex-1 flex-col">
      <Header title="Backup & import" sub={info.name} back="/tree/" />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        {!info.admin ? (
          <ErrorText>Only the owner and admins of this family can export or import. Ask them to do it for you.</ErrorText>
        ) : (
          <>
            <div role="tablist" className="grid grid-cols-2 rounded-lg border border-black/15 p-1 dark:border-white/20">
              {(["export", "import"] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`min-h-10 rounded-md text-sm font-medium ${tab === t ? "bg-brand text-white" : ""}`}>
                  {t === "export" ? "Export" : "Import & restore"}
                </button>
              ))}
            </div>
            {tab === "export" ? <Export familyId={familyId} familyName={info.name} /> : <Import familyId={familyId} />}
          </>
        )}
      </main>
    </div>
  );
}
