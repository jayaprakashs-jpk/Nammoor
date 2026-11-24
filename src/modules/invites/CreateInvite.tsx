"use client";

import { useEffect, useState, type FormEvent } from "react";
import { sb, type Enums } from "@/shared/lib/supabase";
import { isNativeApp } from "@/shared/lib/platform";
import { friendlyError } from "@/shared/lib/errors";
import { Header } from "@/shared/ui/Header";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { Button, ErrorText, Field, Input, Section, Select } from "@/shared/ui/form";
import { shareMessage } from "./code";

type Role = Enums<"family_role_t">;

interface Ctx {
  familyName: string;
  myRole: Role | null;
  personName: string | null;
}

interface ActiveInvite {
  id: string;
  role: Role;
  email: string | null;
  expires_at: string;
  use_count: number;
  max_uses: number;
  person: string | null;
}

// Website address used in invite links. Without it (inside the app), only the code is shared.
function siteUrl(): string | null {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined" && !isNativeApp() && window.location.protocol.startsWith("http"))
    return window.location.origin;
  return null;
}

export function CreateInvite({ familyId, personId, userId }: { familyId: string; personId: string | null; userId: string }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [active, setActive] = useState<ActiveInvite[]>([]);
  const [role, setRole] = useState<Role>("editor");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(7);
  const [many, setMany] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    const db = sb();
    Promise.all([
      db.from("families").select("name").eq("id", familyId).maybeSingle(),
      db.from("family_members").select("role").eq("family_id", familyId).eq("user_id", userId).maybeSingle(),
      personId ? db.from("persons").select("full_name").eq("id", personId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      db.from("family_invites")
        .select("id, role, email, expires_at, use_count, max_uses, revoked_at, persons(full_name)")
        .eq("family_id", familyId)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    ]).then(([fam, mem, per, inv]) => {
      if (!alive) return;
      const err = fam.error || mem.error || per.error || inv.error;
      if (err) return setError(friendlyError(err));
      setCtx({ familyName: fam.data?.name ?? "Family", myRole: mem.data?.role ?? null, personName: per.data?.full_name ?? null });
      setActive(
        (inv.data ?? [])
          .filter((i) => i.use_count < i.max_uses)
          .map((i) => ({ ...i, person: i.persons?.full_name ?? null })),
      );
    });
    return () => {
      alive = false;
    };
  }, [familyId, personId, userId, refresh]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await sb().rpc("create_invite", {
      p_family_id: familyId,
      p_role: role,
      p_claim_person_id: personId ?? undefined,
      p_email: email.trim() || undefined,
      p_valid_days: days,
      p_max_uses: personId || !many ? 1 : 20,
    });
    setBusy(false);
    if (error || !data) return setError(friendlyError(error));
    setCode(data);
    setRefresh((r) => r + 1);
  }

  async function revoke(id: string) {
    const { error } = await sb().from("family_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return setError(friendlyError(error));
    setRefresh((r) => r + 1);
  }

  if (!ctx && !error) return <ModuleLoading />;
  const isAdmin = ctx?.myRole === "owner" || ctx?.myRole === "admin";
  const link = code ? (siteUrl() ? `${siteUrl()}/invite/?t=${code}` : null) : null;
  const message = code && ctx ? shareMessage(ctx.familyName, code, link, days) : "";

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        /* cancelled: fall through to copy */
      }
    }
    copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setError("Could not copy. Long-press the code to copy it.");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <Header title={personId ? `Invite ${ctx?.personName ?? ""}` : "Invite relatives"} sub={ctx?.familyName} back={personId ? `/person/?id=${personId}` : "/tree/"} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
        {ctx?.myRole === "viewer" || !ctx?.myRole ? (
          <ErrorText>Only editors and admins can invite people.</ErrorText>
        ) : code ? (
          <Section title="Invite ready">
            <p className="text-sm opacity-80">Send this to {ctx.personName ?? "your relative"}. It is shown only once.</p>
            <code className="select-all break-all rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">{code}</code>
            {link && <p className="break-all text-xs opacity-70">{link}</p>}
            <a className="min-h-12 rounded-lg bg-[#25D366] px-4 py-3 text-center font-medium text-white"
              href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
              Send on WhatsApp
            </a>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={share}>Share</Button>
              <Button variant="secondary" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</Button>
            </div>
            <Button variant="ghost" onClick={() => { setCode(null); setCopied(false); }}>Make another invite</Button>
          </Section>
        ) : (
          <form onSubmit={create} className="flex flex-col gap-4">
            {personId && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950">
                When {ctx.personName} joins, they take over their own profile in the tree.
              </p>
            )}
            <Field label="What can they do?">
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="editor">Add and edit their branch</option>
                <option value="viewer">View only</option>
                {isAdmin && <option value="admin">Admin: manage the whole tree</option>}
              </Select>
            </Field>
            <Field label="Their email (optional)" hint="If set, only this email can use the invite. Safer if the message gets forwarded.">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Valid for">
              <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
              </Select>
            </Field>
            {!personId && (
              <label className="flex min-h-12 items-center gap-3">
                <input type="checkbox" className="h-5 w-5" checked={many} onChange={(e) => setMany(e.target.checked)} />
                <span className="text-sm">Let up to 20 people use this one invite (for a family WhatsApp group)</span>
              </label>
            )}
            <ErrorText>{error}</ErrorText>
            <Button type="submit" busy={busy}>Create invite</Button>
          </form>
        )}

        {active.length > 0 && (
          <Section title="Active invites">
            {active.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{i.person ?? i.email ?? "Anyone with the code"}</span>
                  <span className="block text-xs opacity-60">
                    {i.role} · {i.use_count}/{i.max_uses} used · ends {new Date(i.expires_at).toLocaleDateString("en-IN")}
                  </span>
                </span>
                <button type="button" onClick={() => revoke(i.id)} className="min-h-10 px-2 text-red-700">Cancel</button>
              </div>
            ))}
          </Section>
        )}
      </main>
    </div>
  );
}
