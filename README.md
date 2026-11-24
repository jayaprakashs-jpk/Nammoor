# Nammoor (நம்மூர்)

Family tree, relatives, functions and transport. One codebase: website + Android app.

**Stack:** Next.js 16 (static export) + TypeScript + Tailwind 4 → Capacitor 8 (Android) → Supabase (Postgres, Auth, Realtime, Storage).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local web dev server |
| `npm run check` | Lint + typecheck + unit tests + production build |
| `npm run db:test` | Throwaway Postgres, apply migrations, run 17 RLS/integrity test groups |
| `npm run android:sync` | Build web and copy it into the Android project |
| `npm run android:apk` | Build a debug APK (needs Android SDK, `ANDROID_HOME`) |

CI (`.github/workflows/ci.yml`) runs all of this on every push and uploads `nammoor-debug-apk`.

## Folder plan

```
src/
  app/                 Routes only. Each page is 5 lines: dynamic-import a module.
  config/modules.ts    Module registry. Phase 2-4 modules are switched off here.
  modules/             One folder per feature. Never import from another module's insides.
    auth/  family-tree/ (views/)  profiles/  relations/  chat/  invites/
  shared/              Code any module can use: supabase client, platform, ui.
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
