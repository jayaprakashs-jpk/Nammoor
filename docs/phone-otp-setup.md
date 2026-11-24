# Mobile number sign-in (SMS codes) for Nammoor

Everything in the app and database is already built and tested. What is left is **your SMS account**
and 6 clicks in Supabase. Until then, tapping "Send code" with a mobile number shows
"Mobile number codes are not switched on yet. Please use your email." and nothing breaks.

## How it fits together

    App  ->  Supabase Auth  ->  "Send SMS" hook (Edge Function send-sms)
                                   1. is the request really from Supabase? (signature)
                                   2. database check: max 3 texts per number per 15 minutes,
                                      only India (+91) by default, global cap per hour
                                   3. send through MSG91 (or Twilio)

The database check runs for EVERY text, even if someone skips the app and calls Supabase directly.
The app adds its own limit too (3 per number, 5 per phone, per 15 minutes), but that is only for
convenience. The Edge Function is what stops SMS-pumping fraud.

Using Supabase's built-in Twilio box instead of this hook works, but then there is **no** 3-per-15-minutes
database limit, only Supabase's own project-wide limits. For India we recommend this hook with MSG91.

## A. MSG91 (recommended for India)

India requires **DLT registration** (a TRAI rule) before any business SMS can be delivered. This is
paperwork and takes a few days. Start it first.

1. Create an account at https://msg91.com and finish KYC.
2. **DLT:** register your business on a DLT portal (Jio, Airtel, Vodafone-Idea or BSNL). You need:
   - an **Entity ID** (your registration),
   - a **Sender ID / Header** (6 letters, e.g. `NAMOOR`),
   - an approved **OTP template**, for example:
     `{#var#} is your Nammoor code. Do not share it with anyone.`
3. In MSG91: **OTP -> Templates -> Add template**, paste the same text with `##var##` for the code, link your
   DLT Entity ID, Header and Template ID. Copy the MSG91 **Template ID**.
4. In MSG91: **Authkey** (top right menu). Copy your **Auth Key**.

## B. Twilio (alternative)

Twilio can text India but also needs DLT registration there, and is more expensive. It works well for
numbers outside India. Create an account, buy a number (or a Messaging Service), and note the
**Account SID**, **Auth Token** and the **From** number.

## C. Deploy the hook (once)

You need the Supabase CLI on a computer (https://supabase.com/docs/guides/cli), then in this repository:

    supabase login
    supabase link --project-ref ijvisbjyhkpifhyltrxk
    supabase functions deploy send-sms --no-verify-jwt

`--no-verify-jwt` is correct here: Supabase Auth calls this function with a signature, not a login token.
The function checks that signature itself.

## D. Turn on the hook in Supabase

1. **Authentication -> Hooks -> Send SMS hook -> Add hook** -> type **HTTPS**
   URL: `https://ijvisbjyhkpifhyltrxk.supabase.co/functions/v1/send-sms`
   Click **Generate secret** and copy it (it looks like `v1,whsec_...`). Save.
2. Give the function its settings (MSG91 shown):

       supabase secrets set SMS_PROVIDER=msg91 MSG91_AUTH_KEY=PASTE_KEY MSG91_TEMPLATE_ID=PASTE_ID \
         SEND_SMS_HOOK_SECRET='v1,whsec_PASTE_SECRET'

   Twilio instead:

       supabase secrets set SMS_PROVIDER=twilio TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... \
         TWILIO_FROM=+1... SEND_SMS_HOOK_SECRET='v1,whsec_PASTE_SECRET'

3. **Authentication -> Sign In / Providers -> Phone** -> switch **Enable Phone provider** ON,
   **SMS OTP length = 6**, **SMS OTP expiry = 300** seconds. (The SMS provider box is not used when the hook is on.)

## E. Test it

1. Open the app, type your own mobile number, tap **Send code**. The SMS should arrive in a few seconds.
2. Ask for 4 codes quickly. The 4th must be refused: "Too many codes for this number...".
3. See what happened (Supabase -> SQL Editor):

       select phone, at, allowed, reason from app.sms_otp_log order by id desc limit 20;

4. Function errors: **Edge Functions -> send-sms -> Logs**. Messages say *which setting is missing*, never the secret.

For development without spending SMS: **Authentication -> Providers -> Phone -> Test phone numbers**
lets a number like `919999999999=123456` always accept `123456` and send nothing.

## F. Tuning (SQL Editor)

    -- allow Sri Lanka and Singapore as well
    update app.sms_settings set allowed_prefixes = array['91','94','65'];
    -- stricter or looser
    update app.sms_settings set per_number_max = 3, per_number_minutes = 15, hourly_cap = 300;

`hourly_cap` is the most important protection against fraud: it caps the total SMS per hour for the
whole app. Set it to roughly twice your busiest real hour.

## What stays unverified until you have an SMS account

I tested the database limit, the signature-less logic, and the provider requests with simulated
providers (unit tests). I have **not** sent a real SMS, because that needs your MSG91/Twilio account.
The first real test in step E is the proof.
