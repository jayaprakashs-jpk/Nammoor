"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sb, type DB } from "@/shared/lib/supabase";
import { useSession } from "@/shared/lib/session";
import { setCurrentFamilyId } from "@/shared/lib/storage";
import { invalidateGraph } from "@/shared/lib/graphStore";
import { friendlyError } from "@/shared/lib/errors";
import { Header } from "@/shared/ui/Header";
import { Button, ErrorText, Field, Input } from "@/shared/ui/form";
import { extractCode, prettyCode } from "./code";

type Preview = DB["Functions"]["invite_preview"]["Returns"][number];

const ROLE_TEXT: Record<string, string> = {
  admin: "manage the whole tree",
  editor: "add and edit your branch",
  viewer: "view the tree",
};

export function JoinFamily({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const { userId, loading } = useSession();
  const [text, setText] = useState(initialCode);
  const [result, setResult] = useState<{ code: string; preview: Preview | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const code = extractCode(text);

  // Preview needs sign-in (it counts wrong guesses per account).
  useEffect(() => {
    if (!code || !userId) return;
    let alive = true;
    sb()
      .rpc("invite_preview", { p_code: code })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) return setError(friendlyError(error));
        setResult({ code, preview: data?.[0] ?? null });
      });
    return () => {
      alive = false;
    };
  }, [code, userId]);

  async function join() {
    if (!code) return;
    setBusy(true);
    setError("");
    const { data, error } = await sb().rpc("accept_invite", { p_code: code });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    if (!data) return setError("This code is wrong, expired or already used. Ask your relative for a new one.");
    setCurrentFamilyId(data);
    invalidateGraph(data);
    router.replace("/tree/");
  }

  // Only show the preview that belongs to the code currently typed.
  const shown = userId && code && result?.code === code ? result.preview : undefined;

  return (
    <div className="flex flex-1 flex-col">
      <Header title="Join a family" sub="குடும்பத்தில் சேர" back={userId ? "/tree/" : "/"} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
        <Field label="Invite code" hint="Type the 8 letter code, or paste the whole message your relative sent">
          <Input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="characters"
            spellCheck={false} placeholder="ABCD-EFGH" className="text-center text-xl tracking-widest" />
        </Field>

        {text && !code && <p className="text-sm opacity-70">That doesn&apos;t look like an invite code yet.</p>}
        {code && userId && shown === null && (
          <ErrorText>This invite is wrong, expired or already used. Ask your relative for a new one.</ErrorText>
        )}
        {shown && (
          <div className="flex flex-col gap-1 rounded-xl bg-amber-50 p-4 dark:bg-amber-950">
            <p className="text-lg font-semibold">{shown.family_name}</p>
            <p className="text-sm">
              {shown.invited_by ?? "A relative"} invited you to {ROLE_TEXT[shown.role] ?? "join"}.
            </p>
            {shown.person_name && <p className="text-sm">You will be added as <b>{shown.person_name}</b> in the tree.</p>}
            {shown.email_locked && <p className="text-xs opacity-70">This invite works only for the email it was sent to.</p>}
          </div>
        )}

        <ErrorText>{error}</ErrorText>
        {shown && <Button onClick={join} busy={busy}>Join {shown.family_name}</Button>}
        {code && !userId && !loading && (
          <Link href={`/login/?next=${encodeURIComponent(`/invite/?t=${code}`)}`}
            className="min-h-12 rounded-lg bg-brand px-4 py-3 text-center font-medium text-white">
            Sign in to use code {prettyCode(code)}
          </Link>
        )}
      </main>
    </div>
  );
}
