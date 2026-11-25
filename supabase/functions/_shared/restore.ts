// Logic of the restore-photo Edge Function, kept free of Deno so it can be unit tested.
// The Deno entry (restore-photo/index.ts) only wires real services into `RestoreDeps`.
//
// Rules:
//  * No REPLICATE_API_TOKEN  -> the feature reports "not available" and nothing else happens.
//  * The 3 per family per day limit is checked by the database (ai_restore_begin), not here.
//  * A slot is taken before the paid call and given back (status failed) if anything goes wrong.

export const REPLICATE_MODEL = "flux-kontext-apps/restore-image";
export const MAX_RESULT_BYTES = 4 * 1024 * 1024; // album bucket limit
const WAIT_SECONDS = 60;
const POLL_MS = 2500;
const POLL_TRIES = 12;

export type RestoreRequest = { action?: string; family_id?: string; photo_id?: string };

export interface Begin {
  allowed: boolean;
  reason?: string;
  log_id?: number;
  family_id?: string;
  person_id?: string;
  path?: string;
  remaining?: number;
}

export interface RestoreDeps {
  token: string | undefined;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Calls made as the signed-in user, so database rules apply. */
  status: (familyId: string) => Promise<{ remaining: number }>;
  begin: (photoId: string) => Promise<Begin>;
  /** Calls made with the service key. */
  finish: (logId: number, ok: boolean, resultPhotoId?: string) => Promise<void>;
  download: (path: string) => Promise<{ bytes: Uint8Array; mime: string }>;
  save: (a: { familyId: string; personId: string; sourceId: string; bytes: Uint8Array; mime: string }) => Promise<string>;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (status: number, body: Record<string, unknown>): Reply => ({ status, body });

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Replicate files are served from replicate.delivery. Anything else is refused. */
export function isReplicateFile(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && (url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"));
  } catch {
    return false;
  }
}

interface Prediction {
  status?: string;
  output?: unknown;
  error?: unknown;
  urls?: { get?: string };
}

/** Ask Replicate and wait for the answer. Returns the file URL or throws. */
export async function runReplicate(d: Pick<RestoreDeps, "token" | "fetch" | "sleep">, image: { bytes: Uint8Array; mime: string }): Promise<string> {
  const headers = { authorization: `Bearer ${d.token}`, "content-type": "application/json" };
  const res = await d.fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`, {
    method: "POST",
    headers: { ...headers, Prefer: `wait=${WAIT_SECONDS}` },
    body: JSON.stringify({ input: { input_image: `data:${image.mime};base64,${toBase64(image.bytes)}`, output_format: "jpg" } }),
  });
  if (!res.ok) throw new Error(`replicate ${res.status}`);
  let p = (await res.json()) as Prediction;
  for (let i = 0; i < POLL_TRIES && p.status !== "succeeded"; i++) {
    if (p.status === "failed" || p.status === "canceled") throw new Error("replicate failed");
    if (!p.urls?.get) throw new Error("replicate gave no status link");
    if (!isReplicateApi(p.urls.get)) throw new Error("replicate bad status link");
    await d.sleep(POLL_MS);
    const r = await d.fetch(p.urls.get, { headers: { authorization: headers.authorization } });
    if (!r.ok) throw new Error(`replicate poll ${r.status}`);
    p = (await r.json()) as Prediction;
  }
  if (p.status !== "succeeded") throw new Error("replicate timed out");
  const out = Array.isArray(p.output) ? p.output[0] : p.output;
  if (!isReplicateFile(out)) throw new Error("replicate gave an unexpected file link");
  return out;
}

const isReplicateApi = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && x.hostname === "api.replicate.com";
  } catch {
    return false;
  }
};

export async function handleRestore(req: RestoreRequest, d: RestoreDeps): Promise<Reply> {
  const available = !!d.token?.trim();

  if (req.action === "status") {
    if (!req.family_id || !UUID.test(req.family_id)) return reply(400, { error: "bad family" });
    if (!available) return reply(200, { available: false });
    try {
      const s = await d.status(req.family_id);
      return reply(200, { available: true, remaining: s.remaining });
    } catch {
      return reply(403, { error: "not allowed" });
    }
  }

  if (req.action !== "restore") return reply(400, { error: "unknown action" });
  if (!req.photo_id || !UUID.test(req.photo_id)) return reply(400, { error: "bad photo" });
  // Not set up: say so before taking a slot or touching anything.
  if (!available) return reply(200, { ok: false, reason: "unavailable" });

  let begin: Begin;
  try {
    begin = await d.begin(req.photo_id);
  } catch {
    return reply(403, { error: "not allowed" });
  }
  if (!begin.allowed) return reply(200, { ok: false, reason: begin.reason ?? "daily_limit", remaining: 0 });
  const { log_id: logId, family_id: familyId, person_id: personId, path } = begin;
  if (logId == null || !familyId || !personId || !path) return reply(500, { ok: false, reason: "failed" });

  try {
    const original = await d.download(path);
    const fileUrl = await runReplicate(d, original);
    const file = await d.fetch(fileUrl);
    if (!file.ok) throw new Error("download result failed");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = (file.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!bytes.length || bytes.length > MAX_RESULT_BYTES) throw new Error("result size");
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("result type");
    const newId = await d.save({ familyId, personId, sourceId: req.photo_id, bytes, mime });
    await d.finish(logId, true, newId);
    return reply(200, { ok: true, photo_id: newId, remaining: begin.remaining ?? 0 });
  } catch {
    // The slot comes back; the person sees a plain message, never the provider's error.
    try {
      await d.finish(logId, false);
    } catch {
      /* the 10 minute rule frees the slot anyway */
    }
    return reply(200, { ok: false, reason: "failed", remaining: (begin.remaining ?? 0) + 1 });
  }
}
