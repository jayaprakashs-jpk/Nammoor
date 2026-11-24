"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { sb } from "@/shared/lib/supabase";
import { authError } from "@/shared/lib/errors";
import { RequireAuth } from "@/shared/ui/RequireAuth";
import { Header } from "@/shared/ui/Header";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { ErrorText } from "@/shared/ui/form";
import { Methods } from "./Methods";
import { Protection } from "./Protection";

export default function SecurityModule() {
  return <RequireAuth>{() => <SecurityScreen />}</RequireAuth>;
}

function SecurityScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [error, setError] = useState("");

  const [version, setVersion] = useState(0); // bump to read the account again

  useEffect(() => {
    let alive = true;
    // getUser asks the server, so a number or email you just confirmed shows up
    Promise.all([sb().auth.getUser(), sb().auth.getUserIdentities()]).then(([{ data: u, error: e1 }, { data: ids }]) => {
      if (!alive) return;
      if (e1 || !u.user) return setError(authError(e1));
      setUser(u.user);
      setProviders((ids?.identities ?? u.user.identities ?? []).map((i) => i.provider));
    });
    return () => {
      alive = false;
    };
  }, [version]);

  if (error) return <main className="p-6"><ErrorText>{error}</ErrorText></main>;
  if (!user) return <ModuleLoading />;

  return (
    <div className="flex flex-1 flex-col">
      <Header title="Security" sub="பாதுகாப்பு · sign-in and this phone" back="/tree/" />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        <Methods user={user} providers={providers} onChanged={() => setVersion((v) => v + 1)} />
        <Protection />
      </main>
    </div>
  );
}
