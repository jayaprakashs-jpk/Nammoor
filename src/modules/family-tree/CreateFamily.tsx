"use client";

import { useState, type FormEvent } from "react";
import { sb, type Enums } from "@/shared/lib/supabase";
import { friendlyError } from "@/shared/lib/errors";
import { Button, ErrorText, Field, Input, Select } from "@/shared/ui/form";
import Link from "next/link";

export function CreateFamily({ onCreated }: { onCreated: (familyId: string) => void }) {
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [self, setSelf] = useState("");
  const [gender, setGender] = useState<Enums<"gender_t">>("unknown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await sb().rpc("create_family", {
      p_name: name.trim(),
      p_native_place: place.trim() || undefined,
      p_self_name: self.trim() || undefined,
      p_self_gender: gender,
    });
    setBusy(false);
    if (error || !data) return setError(friendlyError(error));
    onCreated(data);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Start your family tree</h1>
        <p className="text-sm opacity-70">குடும்ப மரம் தொடங்கு. You can invite relatives after this.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Family name" hint="Example: Ramasamy Kudumbam">
          <Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Native place (oor)" hint="Optional. Example: Thanjavur">
          <Input maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} />
        </Field>
        <Field label="Your full name" hint="As your family knows you">
          <Input maxLength={120} value={self} onChange={(e) => setSelf(e.target.value)} />
        </Field>
        <Field label="You are" hint="Needed for correct relation names (Anna, Akka, Mama...)">
          <Select value={gender} onChange={(e) => setGender(e.target.value as Enums<"gender_t">)}>
            <option value="unknown">Choose</option>
            <option value="male">Male · ஆண்</option>
            <option value="female">Female · பெண்</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} disabled={!name.trim()}>
          Create family tree
        </Button>
      </form>
      <p className="text-center text-sm opacity-80">
        Got an invite from a relative?{" "}
        <Link href="/invite/" className="text-brand underline">
          Join their family
        </Link>
      </p>
    </main>
  );
}
