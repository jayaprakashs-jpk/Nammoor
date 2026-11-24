# Nammoor sign-in and security: what is where

| Feature | Where | Notes |
|---|---|---|
| Login screen (Google, email/mobile code, password) | `src/modules/auth` | One smart box; password is one tap further |
| Forgot password with a 6-digit code | `auth/flows.ts` (`sendResetCode`, `verifyCode` type recovery) | Needs the reset email template (`scripts/harden-auth.py`) |
| Phone parsing, +91 default | `auth/identifier.ts` | 15 countries; strict Indian number check |
| Password rules (8+, letter, number) | `auth/password.ts` + Supabase setting | Same rules on both sides |
| Code and wrong-try limits on the phone | `auth/limits.ts` | 3 codes per number, 5 per phone, 5 wrong tries, per 15 minutes |
| SMS limit in the database | migration `..08_auth_security.sql`, `supabase/functions/send-sms` | See `docs/phone-otp-setup.md` |
| Linking Google / email / mobile | `src/modules/security/Methods.tsx` | Needs "manual linking" (set by the script) |
| App Lock | `shared/lib/appLock.ts`, `shared/ui/AppLockGate.tsx` | Android app only |
| Log out of other devices | `security/Protection.tsx` | `signOut({ scope: "others" })` |

## Honest limits

- **Phone limits are speed bumps.** Someone who clears the app's storage resets them. The real limits are
  Supabase's own rate limits and the database SMS limit.
- **Wrong password lockout is on the phone only.** Supabase also rate-limits sign-ins per address. A
  server-side per-account lockout needs Supabase's Password Verification Hook (a paid-plan feature) or CAPTCHA.
- **App Lock is a convenience lock,** not encryption. On a rooted phone it can be bypassed. The phone's own
  screen lock and device encryption are the real protection.
- **"Log out of other devices"** removes their refresh tokens at once, but a device's current access token
  can keep working for up to an hour.
- **Two accounts for one person** is the risk this design reduces: people who sign in with Google today and a
  mobile number tomorrow create two accounts unless they link them (Security settings). Same email in Google
  and email-code sign-in is merged automatically by Supabase.
