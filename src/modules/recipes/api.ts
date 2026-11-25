import { sb } from "@/shared/lib/supabase";
import { newId } from "@/modules/chat/messages";

export interface Recipe {
  id: string;
  family_id: string;
  person_id: string | null;
  title: string;
  title_native: string | null;
  ingredients: string;
  steps: string;
  photo_path: string | null;
  created_by: string;
  created_at: string;
}

const COLS = "id, family_id, person_id, title, title_native, ingredients, steps, photo_path, created_by, created_at";

export async function listRecipes(familyId: string): Promise<Recipe[]> {
  const { data, error } = await sb().from("recipes").select(COLS).eq("family_id", familyId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as Recipe[];
}

export interface RecipeInput {
  person_id: string | null;
  title: string;
  title_native: string | null;
  ingredients: string;
  steps: string;
}

/** Upload (optional) photo, then the row. A failed row removes the new photo again. */
export async function saveRecipe(a: { familyId: string; id?: string; input: RecipeInput; photo?: Blob | null; oldPhoto?: string | null; removePhoto?: boolean }): Promise<Recipe> {
  const id = a.id ?? newId();
  let photo_path: string | null | undefined = undefined; // undefined = leave as it is
  if (a.photo) {
    photo_path = `${a.familyId}/recipes/${id}-${Date.now()}.${a.photo.type === "image/webp" ? "webp" : "jpg"}`;
    const up = await sb().storage.from("family-album").upload(photo_path, a.photo, { contentType: a.photo.type });
    if (up.error) throw up.error;
  } else if (a.removePhoto) photo_path = null;

  const row = { ...a.input, ...(photo_path !== undefined ? { photo_path } : {}) };
  const q = a.id
    ? sb().from("recipes").update(row).eq("id", id).select(COLS)
    : sb().from("recipes").insert({ id, family_id: a.familyId, ...row }).select(COLS);
  const { data, error } = await q;
  if (error || !data?.length) {
    if (a.photo && photo_path) await sb().storage.from("family-album").remove([photo_path]);
    throw error ?? new Error("You don't have permission to do that.");
  }
  if (a.oldPhoto && photo_path !== undefined && a.oldPhoto !== photo_path) await sb().storage.from("family-album").remove([a.oldPhoto]);
  return data[0] as Recipe;
}

export async function deleteRecipe(r: Recipe): Promise<void> {
  const { data, error } = await sb().from("recipes").delete().eq("id", r.id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("You don't have permission to do that.");
  if (r.photo_path) await sb().storage.from("family-album").remove([r.photo_path]);
}

/** Search both the English and Tamil dish names, and ingredients. */
export function matches(r: Pick<Recipe, "title" | "title_native" | "ingredients">, q: string): boolean {
  const t = q.normalize("NFC").trim().toLowerCase();
  if (!t) return true;
  return [r.title, r.title_native ?? "", r.ingredients].some((s) => s.normalize("NFC").toLowerCase().includes(t));
}

/** One ingredient per line, blank lines and bullet marks ignored. */
export const lines = (s: string): string[] => s.split(/\r?\n/).map((l) => l.replace(/^\s*[-•*·]\s*/, "").trim()).filter(Boolean);
