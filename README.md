# Nammoor (நம்மூர்)

Family tree, relatives, functions and transport. One codebase: website + Android app.

**Stack:** Next.js 16 (static export) + TypeScript + Tailwind 4 → Capacitor 8 (Android) → Supabase (Postgres, Auth, Realtime, Storage).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local web dev server |
| `npm run check` | Lint + typecheck + unit tests + production build |
| `npm run db:test` | Throwaway Postgres, apply migrations, run the RLS/integrity tests |
| `npm run e2e:views` | Offline UI test: tree views, filters, relation names, chat. Pretend Supabase, no secrets |
| `npm run e2e:smoke` | Signed-out checks against the real Supabase project. No secrets |
| `npm run e2e:full` | Full Phase 1 flow with two test users. Needs `SUPABASE_SECRET_KEY` in your shell, never in a file |
| `npm run android:sync` | Build web and copy it into the Android project |
| `npm run android:apk` | Build a debug APK (needs Android SDK, `ANDROID_HOME`) |

CI (`.github/workflows/ci.yml`) runs all of this on every push and uploads `nammoor-debug-apk`.

## Google sign-in

See `docs/google-signin-setup.md`. It needs a Google Web OAuth client and 2 Supabase settings.

## Android signing

Debug APKs are signed with `android/app/debug.keystore` (committed on purpose) so a new APK always installs over the old one. Never use it for a Play Store release.

## Supabase

Project `ijvisbjyhkpifhyltrxk`. Migrations in `supabase/migrations` are applied in order
and recorded in `supabase_migrations.schema_migrations`, so `supabase db push` stays in sync.

Login is a 6-digit email code. **Before real users can log in:** connect your own SMTP
provider in Supabase (Auth -> Emails -> SMTP), then run `python3 scripts/set-auth-emails.py`
once. Supabase's built-in sender only mails your own team, 2 per hour, with a link instead of a code.

## Folder plan

```
src/
  app/                 Routes only. Each page is 5 lines: dynamic-import a module.
  config/modules.ts    Module registry. Phase 2-4 modules are switched off here.
  modules/             One folder per feature. Never import from another module's insides.
    auth/         Email code login + first-time name
    family-tree/  Create family, tree list grouped by generation
    profiles/     Member profile: view, edit, relatives, photo, private salary/DNA
    invites/      Create + share invites, join with a code
    backup/       Export (.json, GEDCOM 5.5.1) and import with duplicate check, native Share sheet
    relations/    Uravumurai engine. terms.ts is the name table: edit rows there, native speakers should review
    chat/         Family room, private groups, live messages
  shared/              Code any module can use: supabase client, session, graph, age, ui.
supabase/
  migrations/          The schema. Source of truth for data + security.
  tests/               Supabase stub + RLS tests (plain SQL).
android/               Capacitor Android project (generated, committed).
```

## Rules that keep it fast on budget phones

1. Static export. No server. The same `out/` folder is the site and the app.
2. Every module is behind `next/dynamic`. Closed modules cost zero bytes.
3. System fonts only (Android ships Noto Sans Tamil). No web fonts.
4. Whole tree in one RPC call (`family_graph`). Relationship titles are computed on the phone, not stored.
5. Security is in Postgres (RLS + column grants). The app is never trusted.
