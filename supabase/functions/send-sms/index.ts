// Supabase Edge Function: the "Send SMS" Auth Hook.
// Setup steps are in docs/phone-otp-setup.md. Deploy this folder as a function named send-sms.
// @ts-nocheck  (Deno runtime: URL imports and the Deno global)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { handleSms } from "../_shared/sms.ts";

const env = {
  SMS_PROVIDER: Deno.env.get("SMS_PROVIDER"),
  MSG91_AUTH_KEY: Deno.env.get("MSG91_AUTH_KEY"),
  MSG91_TEMPLATE_ID: Deno.env.get("MSG91_TEMPLATE_ID"),
  TWILIO_ACCOUNT_SID: Deno.env.get("TWILIO_ACCOUNT_SID"),
  TWILIO_AUTH_TOKEN: Deno.env.get("TWILIO_AUTH_TOKEN"),
  TWILIO_FROM: Deno.env.get("TWILIO_FROM"),
  TWILIO_MESSAGING_SERVICE_SID: Deno.env.get("TWILIO_MESSAGING_SERVICE_SID"),
  SMS_TEXT: Deno.env.get("SMS_TEXT"),
};
const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const hookSecret = (Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "").replace("v1,whsec_", "");

Deno.serve(async (req) => {
  const payload = await req.text();
  let event;
  try {
    // Only Supabase Auth can call this: the request must carry a valid signature.
    event = new Webhook(hookSecret).verify(payload, Object.fromEntries(req.headers));
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 401, message: "Bad signature" } }), { status: 401, headers: { "content-type": "application/json" } });
  }
  const reply = await handleSms(event, {
    env,
    fetch,
    rateCheck: async (digits) => {
      const { data, error } = await admin.rpc("sms_rate_check", { p_phone: digits });
      if (error) throw error;
      return data;
    },
  });
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
});
