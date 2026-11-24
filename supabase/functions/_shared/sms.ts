// Logic of the Send SMS hook, kept free of Deno-only code so it can be tested.
// Flow: Supabase Auth asks us to text a code -> check the database rate limit
// -> send through MSG91 or Twilio. Fail closed: if we cannot check, we do not send.

export interface SmsEvent {
  user?: { phone?: string };
  sms?: { otp?: string };
}

export interface Env {
  SMS_PROVIDER?: string;
  MSG91_AUTH_KEY?: string;
  MSG91_TEMPLATE_ID?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
  /** Text for Twilio. Use {{otp}} where the code goes. */
  SMS_TEXT?: string;
}

export interface RateResult {
  allowed: boolean;
  reason: string | null;
  retry_after: number;
}

export interface Deps {
  env: Env;
  rateCheck: (digits: string) => Promise<RateResult>;
  fetch: typeof fetch;
}

export interface Reply {
  status: number;
  body: { error?: { http_code: number; message: string } };
}

export const digitsOf = (raw: string) => raw.replace(/\D/g, "");

const fail = (status: number, message: string): Reply => ({ status, body: { error: { http_code: status, message } } });

export function refusalMessage(r: RateResult): string {
  if (r.reason === "number_limit") {
    const m = Math.max(1, Math.ceil((r.retry_after || 60) / 60));
    return `Too many codes for this number. Please try again in ${m} minute${m === 1 ? "" : "s"}.`;
  }
  if (r.reason === "country_not_allowed") return "We can only send codes to Indian mobile numbers right now. Please use your email instead.";
  if (r.reason === "global_cap") return "Codes are paused for a few minutes. Please try again shortly, or use your email.";
  return "That mobile number does not look right.";
}

export function msg91Request(env: Env, digits: string, otp: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ template_id: env.MSG91_TEMPLATE_ID ?? "", mobile: digits, otp });
  return {
    url: `https://control.msg91.com/api/v5/otp?${q}`,
    init: { method: "POST", headers: { authkey: env.MSG91_AUTH_KEY ?? "", "content-type": "application/json", accept: "application/json" }, body: "{}" },
  };
}

export function twilioRequest(env: Env, digits: string, otp: string): { url: string; init: RequestInit } {
  const sid = env.TWILIO_ACCOUNT_SID ?? "";
  const form = new URLSearchParams({ To: `+${digits}`, Body: (env.SMS_TEXT ?? "{{otp}} is your Nammoor code. Do not share it with anyone.").replace("{{otp}}", otp) });
  if (env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From", env.TWILIO_FROM ?? "");
  return {
    url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    init: { method: "POST", headers: { authorization: `Basic ${btoa(`${sid}:${env.TWILIO_AUTH_TOKEN ?? ""}`)}`, "content-type": "application/x-www-form-urlencoded" }, body: form.toString() },
  };
}

/** Configured? Returns what is missing, so the first test text tells you instead of failing quietly. */
export function missingConfig(env: Env): string | null {
  if (env.SMS_PROVIDER === "msg91") return env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID ? null : "MSG91_AUTH_KEY and MSG91_TEMPLATE_ID";
  if (env.SMS_PROVIDER === "twilio")
    return env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && (env.TWILIO_FROM || env.TWILIO_MESSAGING_SERVICE_SID) ? null : "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID)";
  return "SMS_PROVIDER (msg91 or twilio)";
}

export async function handleSms(event: SmsEvent, d: Deps): Promise<Reply> {
  const otp = event.sms?.otp ?? "";
  const digits = digitsOf(event.user?.phone ?? "");
  if (!/^\d{4,10}$/.test(otp) || digits.length < 8 || digits.length > 15) return fail(400, "That mobile number does not look right.");

  const missing = missingConfig(d.env);
  if (missing) {
    console.error(`send-sms: missing ${missing}`); // the names only, never values
    return fail(503, "Mobile codes are not available right now. Please use your email instead.");
  }

  let rate: RateResult;
  try {
    rate = await d.rateCheck(digits);
  } catch {
    return fail(503, "We could not check this request. Please try again in a minute."); // fail closed
  }
  if (!rate.allowed) return fail(rate.reason === "bad_number" ? 400 : 429, refusalMessage(rate));

  const req = d.env.SMS_PROVIDER === "msg91" ? msg91Request(d.env, digits, otp) : twilioRequest(d.env, digits, otp);
  try {
    const res = await d.fetch(req.url, req.init);
    const text = await res.text();
    let ok = res.ok;
    if (d.env.SMS_PROVIDER === "msg91") {
      try {
        ok = ok && JSON.parse(text).type === "success";
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      console.error(`send-sms: ${d.env.SMS_PROVIDER} said ${res.status}`); // not the body: it can echo the number
      return fail(502, "We could not send the SMS right now. Please try again, or use your email.");
    }
  } catch {
    return fail(502, "We could not send the SMS right now. Please try again, or use your email.");
  }
  return { status: 200, body: {} };
}
