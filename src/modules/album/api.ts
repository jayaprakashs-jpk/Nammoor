import { sb } from "@/shared/lib/supabase";
import { newId } from "@/modules/chat/messages";

export interface AlbumPhoto {
  id: string;
  family_id: string;
  person_id: string;
  path: string;
  caption: string | null;
  year: number | null;
  kind: "photo" | "ai_restored";
  source_id: string | null;
  created_by: string | null;
  created_at: string;
}

const COLS = "id, family_id, person_id, path, caption, year, kind, source_id, created_by, created_at";

export async function listAlbum(personId: string): Promise<AlbumPhoto[]> {
  const { data, error } = await sb().from("person_photos").select(COLS).eq("person_id", personId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AlbumPhoto[];
}

export async function addAlbumPhoto(a: { familyId: string; personId: string; blob: Blob; caption: string; year: number | null }): Promise<AlbumPhoto> {
  const id = newId();
  const ext = a.blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${a.familyId}/${a.personId}/${id}.${ext}`;
  const up = await sb().storage.from("family-album").upload(path, a.blob, { contentType: a.blob.type });
  if (up.error) throw up.error;
  const { data, error } = await sb()
    .from("person_photos")
    .insert({ id, family_id: a.familyId, person_id: a.personId, path, caption: a.caption.trim() || null, year: a.year })
    .select(COLS)
    .single();
  if (error) {
    await sb().storage.from("family-album").remove([path]);
    throw error;
  }
  return data as AlbumPhoto;
}

export async function deleteAlbumPhoto(p: AlbumPhoto): Promise<void> {
  const { data, error } = await sb().from("person_photos").delete().eq("id", p.id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("You don't have permission to do that.");
  await sb().storage.from("family-album").remove([p.path]);
}

const cache = new Map<string, { url: string; until: number }>();
export async function albumUrls(paths: string[]): Promise<Map<string, string>> {
  const need = paths.filter((p) => (cache.get(p)?.until ?? 0) <= Date.now());
  if (need.length) {
    const { data } = await sb().storage.from("family-album").createSignedUrls(need, 3600);
    for (const d of data ?? []) if (d.signedUrl && d.path) cache.set(d.path, { url: d.signedUrl, until: Date.now() + 3500_000 });
  }
  return new Map(paths.flatMap((p) => (cache.get(p) ? [[p, cache.get(p)!.url] as const] : [])));
}

// ---- AI restore (optional) ----
export type AiStatus = { state: "unavailable" } | { state: "ready"; remaining: number };

/** Never throws: any trouble (no token, function not deployed, offline) just means "Coming soon". */
export async function aiStatus(familyId: string): Promise<AiStatus> {
  try {
    const { data, error } = await sb().functions.invoke("restore-photo", { body: { action: "status", family_id: familyId } });
    if (error || !data?.available) return { state: "unavailable" };
    return { state: "ready", remaining: Number(data.remaining) || 0 };
  } catch {
    return { state: "unavailable" };
  }
}

export type AiResult = { ok: true; photoId: string; remaining: number } | { ok: false; reason: "daily_limit" | "unavailable" | "failed" };

export async function aiRestore(photoId: string): Promise<AiResult> {
  try {
    const { data, error } = await sb().functions.invoke("restore-photo", { body: { action: "restore", photo_id: photoId } });
    if (error || !data) return { ok: false, reason: "failed" };
    if (data.ok) return { ok: true, photoId: data.photo_id, remaining: Number(data.remaining) || 0 };
    return { ok: false, reason: data.reason === "daily_limit" || data.reason === "unavailable" ? data.reason : "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
