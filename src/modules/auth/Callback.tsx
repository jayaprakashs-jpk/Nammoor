"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { finishGoogleLogin } from "./google";

// Where the website lands after Google. (The Android app uses NativeBridge instead.)
export default function Callback() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    finishGoogleLogin(window.location.href).then((r) => {
      if ("error" in r) setError(r.error);
      else router.replace(r.next);
    });
  }, [router]);

  if (!error) return <ModuleLoading />;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Google sign in did not finish</h1>
      <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>
      <Link href="/login/" className="min-h-12 rounded-lg bg-brand px-4 py-3 text-center font-medium text-white">Back to sign in</Link>
    </main>
  );
}
