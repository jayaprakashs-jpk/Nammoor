import { sb } from "@/shared/lib/supabase";
import type { Clip } from "./recorder";
import { newId } from "@/modules/chat/messages";

export interface VoiceMemo {
  id: string;
  family_id: string;
  person_id: string;
  photo_id: string | null;
  audio_path: string;
  duration_sec: number;
  title: string | null;
  author_id: string;
  created_at: string;
}

const COLS = "id, family_id, person_id, photo_id, audio_path, duration_sec, title, author_id, created_at";

export async function listVoice(personId: string): Promise<VoiceMemo[]> {
  const { data, error } = await sb().from("voice_memories").select(COLS).eq("person_id", personId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as VoiceMemo[];
}

/** Save the clip, then its row. If the row fails the file is removed, so nothing is left behind. */
export async function saveVoice(a: { familyId: string; personId: string; photoId: string | null; clip: Clip; title: string }): Promise<VoiceMemo> {
  const id = newId();
  const path = `${a.familyId}/${a.personId}/${id}.${a.clip.ext}`;
  const up = await sb().storage.from("family-audio").upload(path, a.clip.blob, { contentType: a.clip.mime });
  if (up.error) throw up.error;
  const { data, error } = await sb()
    .from("voice_memories")
    .insert({ id, family_id: a.familyId, person_id: a.personId, photo_id: a.photoId, audio_path: path, duration_sec: Math.max(1, Math.min(185, a.clip.seconds)), title: a.title.trim() || null })
    .select(COLS)
    .single();
  if (error) {
    await sb().storage.from("family-audio").remove([path]);
    throw error;
  }
  return data as VoiceMemo;
}

export async function deleteVoice(m: VoiceMemo): Promise<void> {
  const { data, error } = await sb().from("voice_memories").delete().eq("id", m.id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("You don't have permission to do that.");
  await sb().storage.from("family-audio").remove([m.audio_path]);
}

const cache = new Map<string, { url: string; until: number }>();
/** A signed link, good for an hour. Asked for only when someone taps play. */
export async function audioUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await sb().storage.from("family-audio").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not open this recording");
  cache.set(path, { url: data.signedUrl, until: Date.now() + 3500_000 });
  return data.signedUrl;
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
