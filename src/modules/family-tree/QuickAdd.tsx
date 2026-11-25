"use client";

import { useState, type FormEvent } from "react";
import { sb } from "@/shared/lib/supabase";
import { invalidateGraph } from "@/shared/lib/graphStore";
import { friendlyError } from "@/shared/lib/errors";
import { toast } from "@/shared/ui/Toast";
import { Button, ErrorText, Field, Input } from "@/shared/ui/form";
import { AddDuplicateHint } from "@/modules/profiles/DuplicateHints";

// A small sheet for the "+ Add Father" and "+ Add Mother" cards.
export function QuickAdd({ familyId, childId, childName, role, onClose, onAdded }: {
  familyId: string; childId: string; childName: string; role: "father" | "mother"; onClose: () => void; onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [place, setPlace] = useState("");
  const [dead, setDead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = role === "father" ? "father" : "mother";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (year && !/^\d{4}$/.test(year)) return setError("Type all 4 digits of the year, or leave it empty.");
    setBusy(true);
    setError("");
    const { error } = await sb().rpc("add_relative", {
      p_anchor: childId,
      p_relation: role,
      p_person: { full_name: name.trim(), birth_date: year ? `${year}-01-01` : null, birth_precision: year ? "year" : "unknown", is_living: !dead, native_place: place.trim() || null },
    });
    setBusy(false);
    if (error) {
      const m = friendlyError(error);
      setError(m);
      return toast(`Not added. ${m}`, "error");
    }
    invalidateGraph(familyId);
    toast(`Added ${name.trim()} ✓`);
    onAdded();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" role="dialog" aria-modal="true" aria-label={`Add ${label}`}>
      <form onSubmit={submit} noValidate className="flex w-full max-w-md flex-col gap-3 rounded-t-2xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-lg font-semibold">Add {label} of {childName}</p>
        <Field label="Full name">
          <Input autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Year of birth" hint="Optional. You can add more details later.">
          <Input inputMode="numeric" pattern="[0-9]*" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </Field>
        <Field label="Native place (oor)" hint="Optional. Helps us spot people already in your tree.">
          <Input maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} />
        </Field>
        <AddDuplicateHint familyId={familyId} anchorId={childId} candidate={{ name, birthYear: /^\d{4}$/.test(year) ? Number(year) : null, nativePlace: place }} />
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={dead} onChange={(e) => setDead(e.target.checked)} />
          <span>Passed away</span>
        </label>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="submit" busy={busy} disabled={!name.trim()} className="flex-1">Add {label}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
