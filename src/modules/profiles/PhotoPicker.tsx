"use client";

import { useRef, useState } from "react";
import { sb } from "@/shared/lib/supabase";
import { friendlyError } from "@/shared/lib/errors";
import { Avatar } from "@/shared/ui/Avatar";
import { assertUpdated, type Person } from "./api";

// Shrink on the phone before upload: a 4 MB camera photo becomes ~60-150 KB.
async function compress(file: File, maxSide = 640): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.8));
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
  if (!jpeg) throw new Error("Could not read this photo");
  return jpeg;
}

export function PhotoPicker({ person, editable, onChanged }: { person: Person; editable: boolean; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const blob = await compress(file);
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const path = `${person.family_id}/${person.id}/${Date.now()}.${ext}`;
      const up = await sb().storage.from("person-photos").upload(path, blob, { contentType: blob.type });
      if (up.error) throw up.error;
      const { data, error } = await sb().from("persons").update({ photo_path: path }).eq("id", person.id).select("id");
      if (error) throw error;
      assertUpdated(data);
      if (person.photo_path) await sb().storage.from("person-photos").remove([person.photo_path]);
      onChanged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={!editable || busy}
        onClick={() => input.current?.click()}
        aria-label={editable ? "Change photo" : "Photo"}
        className="relative rounded-full"
      >
        <Avatar name={person.full_name} path={person.photo_path} size={96} />
        {editable && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-brand px-2 py-0.5 text-xs text-white">
            {busy ? "..." : "Edit"}
          </span>
        )}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
