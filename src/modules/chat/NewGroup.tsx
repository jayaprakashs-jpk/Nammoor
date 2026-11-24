"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { friendlyError } from "@/shared/lib/errors";
import { Header } from "@/shared/ui/Header";
import { Button, ErrorText, Field, Input } from "@/shared/ui/form";

export function NewGroup({ familyId, userId }: { familyId: string; userId: string }) {
  const router = useRouter();
  const [people, setPeople] = useState<{ id: string; name: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    sb()
      .from("family_members")
      .select("user_id, profiles!family_members_user_id_fkey(display_name)")
      .eq("family_id", familyId)
      .then(({ data, error }) => {
        if (error) return setError(friendlyError(error));
        setPeople(
          (data ?? [])
            .filter((m) => m.user_id !== userId)
            .map((m) => ({ id: m.user_id, name: m.profiles?.display_name || "Family member" }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      });
  }, [familyId, userId]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await sb().rpc("create_group_chat", {
      p_family_id: familyId,
      p_name: name.trim(),
      p_member_ids: [...picked],
    });
    setBusy(false);
    if (error || !data) return setError(friendlyError(error));
    router.replace(`/chat/?family=${familyId}&room=${data}`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <Header title="New private group" back={`/chat/?family=${familyId}`} />
      <form onSubmit={create} className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        <Field label="Group name" hint="Example: Pongal plan, Wedding cooking team">
          <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Who is in it?</legend>
          {people === null ? <p className="text-sm opacity-70">Loading...</p> : people.length === 0 ? (
            <p className="text-sm opacity-70">Invite relatives to the family first. Only people who joined Nammoor can be added.</p>
          ) : (
            people.map((p) => (
              <label key={p.id} className="flex min-h-12 items-center gap-3 rounded-lg border border-black/10 px-3 dark:border-white/15">
                <input type="checkbox" className="h-5 w-5" checked={picked.has(p.id)}
                  onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                <span>{p.name}</span>
              </label>
            ))
          )}
        </fieldset>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} disabled={!name.trim() || picked.size === 0}>Create group</Button>
      </form>
    </div>
  );
}
