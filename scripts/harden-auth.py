#!/usr/bin/env python3
"""Sign-in settings Nammoor needs on the Supabase project. Shows what would change; applies with --apply.

  python3 scripts/harden-auth.py            # look only (nothing is changed)
  python3 scripts/harden-auth.py --apply    # change it

What it sets:
  password   minimum 8 characters, must contain a letter and a number (same rules as the app)
  emails     6-digit codes (not links) for: password reset, adding an email
  linking    lets people link Google / email / mobile to one account (Security settings)

NOT set here (needs your SMS account and a secret): mobile OTP. See docs/phone-otp-setup.md.
Needs SUPABASE_ACCESS_TOKEN in your shell (or a proxy that adds it).
"""
import json, os, pathlib, sys, urllib.request

REF = "ijvisbjyhkpifhyltrxk"
root = pathlib.Path(__file__).resolve().parent.parent
read = lambda n: (root / "supabase/email" / n).read_text()
LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

WANT = {
    "password": {
        "password_min_length": 8,
        "password_required_characters": f"{LETTERS}:0123456789",  # one letter AND one digit
    },
    "emails": {
        "mailer_subjects_recovery": "{{ .Token }} is your Nammoor password reset code",
        "mailer_templates_recovery_content": read("reset-code.html"),
        "mailer_subjects_email_change": "{{ .Token }} confirms your new Nammoor email",
        "mailer_templates_email_change_content": read("change-email-code.html"),
    },
    "linking": {"security_manual_linking_enabled": True},
}

def call(method, body=None):
    headers = {"Content-Type": "application/json"}
    if os.environ.get("SUPABASE_ACCESS_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"]
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/config/auth",
                                 data=json.dumps(body).encode() if body else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"Failed ({e.code}): {e.read().decode()[:300]}")

apply = "--apply" in sys.argv
now = call("GET")
patch = {}
for group, items in WANT.items():
    for k, v in items.items():
        if now.get(k) != v:
            patch[k] = v
            short = (v[:40] + "...") if isinstance(v, str) and len(v) > 40 else v
            print(f"  {group:9} {k}: {now.get(k)!r:.40} -> {short!r}")
if not patch:
    print("Already set. Nothing to change.")
elif not apply:
    print(f"\n{len(patch)} setting(s) would change. Run again with --apply to change them.")
else:
    done = call("PATCH", patch)
    bad = [k for k, v in patch.items() if done.get(k) != v]
    print("\nApplied." if not bad else f"\nSaved, but these did not stick: {bad}")
