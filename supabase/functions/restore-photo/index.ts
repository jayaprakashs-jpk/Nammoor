// Supabase Edge Function: optional AI photo restore (Replicate).
// Setup steps are in docs/heritage-setup.md. Deploy this folder as a function named restore-photo.
// Without the REPLICATE_API_TOKEN secret the function just says "not available" and the app shows "Coming soon".
// @ts-nocheck  (Deno runtime: URL imports and the Deno global)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleRestore } from "../_shared/restore.ts";

const URL_ = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
const BUCKET = "family-album";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const send = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return send(405, { error: "POST only" });
  const auth = req.headers.get("authorization");
  if (!auth) return send(401, { error: "Sign in first" });

  // Acts as the signed-in person, so family rules and the daily limit apply to them.
  const user = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who } = await user.auth.getUser();
  if (!who?.user) return send(401, { error: "Sign in first" });
  // Only for storage and for closing the log: never trusted with a request's own ids.
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  let body;
  try {
    body = await req.json();
  } catch {
    return send(400, { error: "bad request" });
  }

  const reply = await handleRestore(body, {
    token: TOKEN,
    fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    status: async (familyId) => {
      const { data, error } = await user.rpc("ai_restore_status", { p_family_id: familyId });
      if (error) throw error;
      return data;
    },
    begin: async (photoId) => {
      const { data, error } = await user.rpc("ai_restore_begin", { p_photo_id: photoId });
      if (error) throw error;
      return data;
    },
    finish: async (logId, ok, resultId) => {
      const { error } = await admin.rpc("ai_restore_finish", { p_log_id: logId, p_ok: ok, p_result: resultId ?? null });
      if (error) throw error;
    },
    download: async (path) => {
      const { data, error } = await user.storage.from(BUCKET).download(path); // RLS: members only
      if (error) throw error;
      return { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type || "image/jpeg" };
    },
    save: async ({ familyId, personId, sourceId, bytes, mime }) => {
      const id = crypto.randomUUID();
      const path = `${familyId}/${personId}/${id}.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
      const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime });
      if (up.error) throw up.error;
      const { error } = await admin.from("person_photos").insert({
        id, family_id: familyId, person_id: personId, path, kind: "ai_restored", source_id: sourceId,
        caption: "AI restored", created_by: who.user.id,
      });
      if (error) {
        await admin.storage.from(BUCKET).remove([path]);
        throw error;
      }
      return id;
    },
  });
  return send(reply.status, reply.body);
});
