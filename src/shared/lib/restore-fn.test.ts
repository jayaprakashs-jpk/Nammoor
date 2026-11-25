import { describe, expect, it, vi } from "vitest";
import { handleRestore, isReplicateFile, toBase64, type RestoreDeps } from "../../../supabase/functions/_shared/restore";

const FAM = "11111111-1111-4111-8111-111111111111";
const PHOTO = "22222222-2222-4222-8222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";
const NEW = "44444444-4444-4444-8444-444444444444";

const json = (o: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(o), { status: 200, ...init });

function deps(over: Partial<RestoreDeps> = {}, replicate: (url: string, init?: RequestInit) => Response | Promise<Response> = () => json({})) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    return replicate(String(url), init);
  });
  const d: RestoreDeps = {
    token: "r8_test",
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => undefined,
    status: vi.fn(async () => ({ remaining: 2 })),
    begin: vi.fn(async () => ({ allowed: true, log_id: 7, family_id: FAM, person_id: PERSON, path: `${FAM}/${PERSON}/a.jpg`, remaining: 2 })),
    finish: vi.fn(async () => undefined),
    download: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" })),
    save: vi.fn(async () => NEW),
    ...over,
  };
  return { d, calls, fetchMock };
}

const happy = (url: string) => {
  if (url.includes("api.replicate.com/v1/models")) return json({ status: "succeeded", output: "https://replicate.delivery/x/out.jpg" });
  if (url.startsWith("https://replicate.delivery/")) return new Response(new Uint8Array([9, 9, 9, 9]), { status: 200, headers: { "content-type": "image/jpeg" } });
  return new Response("no", { status: 404 });
};

describe("missing token: the feature stays quiet", () => {
  it("status says not available, with no error", async () => {
    const { d } = deps({ token: undefined });
    expect(await handleRestore({ action: "status", family_id: FAM }, d)).toEqual({ status: 200, body: { available: false } });
    expect(d.status).not.toHaveBeenCalled();
  });
  it("restore does nothing: no slot taken, no network call", async () => {
    const { d, fetchMock } = deps({ token: "  " });
    const r = await handleRestore({ action: "restore", photo_id: PHOTO }, d);
    expect(r).toEqual({ status: 200, body: { ok: false, reason: "unavailable" } });
    expect(d.begin).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("status", () => {
  it("returns what is left today", async () => {
    const { d } = deps();
    expect(await handleRestore({ action: "status", family_id: FAM }, d)).toEqual({ status: 200, body: { available: true, remaining: 2 } });
  });
  it("a stranger gets a refusal", async () => {
    const { d } = deps({ status: vi.fn(async () => { throw new Error("42501"); }) });
    expect((await handleRestore({ action: "status", family_id: FAM }, d)).status).toBe(403);
  });
  it("rejects junk ids and unknown actions", async () => {
    const { d } = deps();
    expect((await handleRestore({ action: "status", family_id: "x" }, d)).status).toBe(400);
    expect((await handleRestore({ action: "restore", photo_id: "../../etc" }, d)).status).toBe(400);
    expect((await handleRestore({ action: "nope" }, d)).status).toBe(400);
  });
});

describe("restore", () => {
  it("works end to end: asks Replicate with the right model, saves, closes the log", async () => {
    const { d, fetchMock } = deps({}, happy);
    const r = await handleRestore({ action: "restore", photo_id: PHOTO }, d);
    expect(r).toEqual({ status: 200, body: { ok: true, photo_id: NEW, remaining: 2 } });
    const first = fetchMock.mock.calls[0];
    expect(String(first[0])).toBe("https://api.replicate.com/v1/models/flux-kontext-apps/restore-image/predictions");
    const init = first[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer r8_test");
    expect((init.headers as Record<string, string>).Prefer).toBe("wait=60");
    expect(JSON.parse(String(init.body)).input.input_image).toBe(`data:image/jpeg;base64,${toBase64(new Uint8Array([1, 2, 3]))}`);
    expect(d.save).toHaveBeenCalledWith(expect.objectContaining({ familyId: FAM, personId: PERSON, sourceId: PHOTO, mime: "image/jpeg" }));
    expect(d.finish).toHaveBeenCalledWith(7, true, NEW);
  });
  it("the daily limit stops it before any paid call", async () => {
    const { d, fetchMock } = deps({ begin: vi.fn(async () => ({ allowed: false, reason: "daily_limit" })) }, happy);
    expect(await handleRestore({ action: "restore", photo_id: PHOTO }, d)).toEqual({ status: 200, body: { ok: false, reason: "daily_limit", remaining: 0 } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(d.finish).not.toHaveBeenCalled();
  });
  it("someone who may not touch the photo gets a refusal", async () => {
    const { d, fetchMock } = deps({ begin: vi.fn(async () => { throw new Error("42501"); }) }, happy);
    expect((await handleRestore({ action: "restore", photo_id: PHOTO }, d)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("polls when the first answer is not ready", async () => {
    let polls = 0;
    const { d } = deps({}, (url) => {
      if (url.includes("/predictions") && !url.includes("/p1")) return json({ status: "processing", urls: { get: "https://api.replicate.com/v1/predictions/p1" } });
      if (url.endsWith("/p1")) return polls++ < 2 ? json({ status: "processing", urls: { get: "https://api.replicate.com/v1/predictions/p1" } }) : json({ status: "succeeded", output: ["https://pbxt.replicate.delivery/o.png"] });
      return new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } });
    });
    const r = await handleRestore({ action: "restore", photo_id: PHOTO }, d);
    expect(r.body.ok).toBe(true);
    expect(polls).toBe(3);
  });
  it("on a provider failure the slot is given back and no provider text leaks", async () => {
    const { d } = deps({}, () => new Response("secret provider detail r8_abc", { status: 500 }));
    const r = await handleRestore({ action: "restore", photo_id: PHOTO }, d);
    expect(r).toEqual({ status: 200, body: { ok: false, reason: "failed", remaining: 3 } });
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(d.finish).toHaveBeenCalledWith(7, false);
    expect(d.save).not.toHaveBeenCalled();
  });
  it("gives up after the polling budget", async () => {
    const { d } = deps({}, () => json({ status: "processing", urls: { get: "https://api.replicate.com/v1/predictions/p" } }));
    const r = await handleRestore({ action: "restore", photo_id: PHOTO }, d);
    expect(r.body.reason).toBe("failed");
    expect(d.finish).toHaveBeenCalledWith(7, false);
  });
  it("refuses a result link that is not Replicate's, and a status link to another host", async () => {
    const bad = deps({}, () => json({ status: "succeeded", output: "https://evil.example.com/x.jpg" }));
    expect((await handleRestore({ action: "restore", photo_id: PHOTO }, bad.d)).body.reason).toBe("failed");
    expect(bad.calls.some((c) => c.includes("evil.example.com"))).toBe(false);
    const ssrf = deps({}, () => json({ status: "processing", urls: { get: "http://169.254.169.254/latest" } }));
    expect((await handleRestore({ action: "restore", photo_id: PHOTO }, ssrf.d)).body.reason).toBe("failed");
    expect(ssrf.calls.some((c) => c.includes("169.254"))).toBe(false);
  });
  it("refuses a result that is not an image, or too big", async () => {
    const html = deps({}, (u) => (u.includes("/predictions") ? json({ status: "succeeded", output: "https://replicate.delivery/a" }) : new Response("<html>", { headers: { "content-type": "text/html" } })));
    expect((await handleRestore({ action: "restore", photo_id: PHOTO }, html.d)).body.ok).toBe(false);
    const big = deps({}, (u) => (u.includes("/predictions") ? json({ status: "succeeded", output: "https://replicate.delivery/a" }) : new Response(new Uint8Array(4 * 1024 * 1024 + 1), { headers: { "content-type": "image/jpeg" } })));
    expect((await handleRestore({ action: "restore", photo_id: PHOTO }, big.d)).body.ok).toBe(false);
    expect(big.d.save).not.toHaveBeenCalled();
  });
  it("if saving fails, the slot is refunded", async () => {
    const { d } = deps({ save: vi.fn(async () => { throw new Error("storage"); }) }, happy);
    expect((await handleRestore({ action: "restore", photo_id: PHOTO }, d)).body.reason).toBe("failed");
    expect(d.finish).toHaveBeenCalledWith(7, false);
  });
});

describe("helpers", () => {
  it("only replicate.delivery counts as a Replicate file", () => {
    expect(isReplicateFile("https://replicate.delivery/a.jpg")).toBe(true);
    expect(isReplicateFile("https://pbxt.replicate.delivery/a.jpg")).toBe(true);
    expect(isReplicateFile("http://replicate.delivery/a.jpg")).toBe(false);
    expect(isReplicateFile("https://replicate.delivery.evil.com/a.jpg")).toBe(false);
    expect(isReplicateFile("https://evilreplicate.delivery/a.jpg")).toBe(false);
    expect(isReplicateFile(null)).toBe(false);
  });
  it("base64 handles big files", () => {
    const big = new Uint8Array(300_000).fill(65);
    expect(atob(toBase64(big)).length).toBe(300_000);
  });
});
