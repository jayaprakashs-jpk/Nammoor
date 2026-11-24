#!/usr/bin/env python3
"""Switch Supabase login emails to a 6-digit code (no links).

Run ONCE after you connect a custom SMTP provider in Supabase
(Auth -> Emails -> SMTP settings). On the free plan Supabase refuses
template changes while the built-in email sender is in use.

  SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/set-auth-emails.py
"""
import json, os, pathlib, sys, urllib.request

REF = "ijvisbjyhkpifhyltrxk"
root = pathlib.Path(__file__).resolve().parent.parent
tpl = (root / "supabase/email/otp-code.html").read_text()
body = {
    "mailer_otp_length": 6,
    "mailer_otp_exp": 600,
    "mailer_subjects_magic_link": "{{ .Token }} is your Nammoor code",
    "mailer_subjects_confirmation": "{{ .Token }} is your Nammoor code",
    "mailer_templates_magic_link_content": tpl,
    "mailer_templates_confirmation_content": tpl,
}
headers = {"Content-Type": "application/json"}
if os.environ.get("SUPABASE_ACCESS_TOKEN"):
    headers["Authorization"] = "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"]
req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/config/auth",
                             data=json.dumps(body).encode(), headers=headers, method="PATCH")
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())
except urllib.error.HTTPError as e:
    sys.exit(f"Failed ({e.code}): {e.read().decode()[:300]}")
ok = "{{ .Token }}" in d["mailer_templates_magic_link_content"] and d["mailer_otp_length"] == 6
print("Login emails now send a 6-digit code." if ok else "Saved, but please check the templates in the dashboard.")
