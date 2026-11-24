import { describe, expect, it, vi } from "vitest";
import { digitsOf, handleSms, missingConfig, msg91Request, refusalMessage, twilioRequest, type Deps, type Env, type RateResult } from "../../../supabase/functions/_shared/sms";

const MSG91: Env = { SMS_PROVIDER: "msg91", MSG91_AUTH_KEY: "KEY-SECRET", MSG91_TEMPLATE_ID: "tpl123" };
const TWILIO: Env = { SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "ACxxx", TWILIO_AUTH_TOKEN: "TOK", TWILIO_FROM: "+15005550006" };
const ok = (body: unknown = { type: "success" }, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const allow: RateResult = { allowed: true, reason: null, retry_after: 0 };
const deps = (over: Partial<Deps> & { env?: Env } = {}): Deps => ({ env: MSG91, rateCheck: async () => allow, fetch: ok() as never, ...over });
const event = { user: { phone: "919876543210" }, sms: { otp: "123456" } };

describe("Send SMS hook", () => {
  it("sends through MSG91 with the code, the template and the key in a header (not the URL)", async () => {
    const f = ok();
    const r = await handleSms(event, deps({ fetch: f as never }));
    expect(r).toEqual({ status: 200, body: {} });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/control\.msg91\.com\/api\/v5\/otp\?/);
    expect(url).toContain("template_id=tpl123");
    expect(url).toContain("mobile=919876543210");
    expect(url).toContain("otp=123456");
    expect(url).not.toContain("KEY-SECRET");
    expect((init.headers as Record<string, string>).authkey).toBe("KEY-SECRET");
  });
  it("sends through Twilio as a form with Basic auth", async () => {
    const f = ok({ sid: "SM1" }, 201);
    const r = await handleSms(event, deps({ env: TWILIO, fetch: f as never }));
    expect(r.status).toBe(200);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages.json");
    expect(init.body).toContain("To=%2B919876543210");
    expect(init.body).toContain("123456");
    expect(init.body).toContain("From=%2B15005550006");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa("ACxxx:TOK")}`);
  });
  it("Twilio: a messaging service id replaces From", () => {
    const r = twilioRequest({ ...TWILIO, TWILIO_FROM: undefined, TWILIO_MESSAGING_SERVICE_SID: "MG1" }, "919876543210", "111222");
    expect(r.init.body).toContain("MessagingServiceSid=MG1");
    expect(r.init.body).not.toContain("From=");
  });
  it("asks the database first, and does NOT send when the limit says no", async () => {
    const f = ok();
    const r = await handleSms(event, deps({ fetch: f as never, rateCheck: async () => ({ allowed: false, reason: "number_limit", retry_after: 600 }) }));
    expect(r.status).toBe(429);
    expect(r.body.error!.message).toMatch(/Too many codes.*10 minutes/);
    expect(f).not.toHaveBeenCalled();
  });
  it("refusals have plain words", () => {
    expect(refusalMessage({ allowed: false, reason: "country_not_allowed", retry_after: 0 })).toMatch(/Indian mobile numbers/);
    expect(refusalMessage({ allowed: false, reason: "global_cap", retry_after: 600 })).toMatch(/paused/);
    expect(refusalMessage({ allowed: false, reason: "number_limit", retry_after: 1 })).toMatch(/1 minute\./);
  });
  it("fails CLOSED: if the limit check breaks, nothing is sent", async () => {
    const f = ok();
    const r = await handleSms(event, deps({ fetch: f as never, rateCheck: async () => { throw new Error("db down"); } }));
    expect(r.status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });
  it("tells which settings are missing, never the values", () => {
    expect(missingConfig({})).toMatch(/SMS_PROVIDER/);
    expect(missingConfig({ SMS_PROVIDER: "msg91", MSG91_AUTH_KEY: "k" })).toMatch(/MSG91_TEMPLATE_ID/);
    expect(missingConfig(MSG91)).toBeNull();
    expect(missingConfig(TWILIO)).toBeNull();
  });
  it("an unconfigured hook refuses politely and does not call anyone", async () => {
    const f = ok();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await handleSms(event, deps({ env: {}, fetch: f as never }));
    expect(r.status).toBe(503);
    expect(r.body.error!.message).toMatch(/email/);
    expect(f).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("a provider failure becomes a clear message and never leaks the code or the key", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const f of [ok({ type: "error", message: "bad template" }), ok({}, 500), vi.fn(async () => { throw new Error("network"); })]) {
      const r = await handleSms(event, deps({ fetch: f as never }));
      expect(r.status).toBe(502);
      expect(JSON.stringify(r)).not.toMatch(/123456|KEY-SECRET|919876543210|bad template/);
    }
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/123456|KEY-SECRET|919876543210/);
    spy.mockRestore();
  });
  it("rejects junk input before doing anything", async () => {
    const f = ok();
    for (const bad of [{}, { user: { phone: "12" }, sms: { otp: "123456" } }, { user: { phone: "919876543210" }, sms: { otp: "abc" } }, { user: { phone: "919876543210" } }]) {
      expect((await handleSms(bad, deps({ fetch: f as never }))).status).toBe(400);
    }
    expect(f).not.toHaveBeenCalled();
  });
  it("accepts the number with or without a plus", async () => {
    const seen: string[] = [];
    for (const phone of ["+919876543210", "919876543210", "+91 98765 43210"]) await handleSms({ user: { phone }, sms: { otp: "123456" } }, deps({ rateCheck: async (d) => (seen.push(d), allow) }));
    expect(new Set(seen)).toEqual(new Set(["919876543210"]));
    expect(digitsOf("+91 (987) 65-43210")).toBe("919876543210");
  });
  it("MSG91 builder encodes values", () => {
    expect(msg91Request({ ...MSG91, MSG91_TEMPLATE_ID: "a&b" }, "91900", "1").url).toContain("template_id=a%26b");
  });
});
