This is a Capacitor 8 + Vite + React + TypeScript Android app (Food · Gym · Shop). See plan.md for the product plan.

## Layout

- `src/` — the web app (runs inside the Android WebView). Screens in `src/screens/`, shared UI in `src/components/`.
- `src/db/` — local SQLite (`@capacitor-community/sqlite`), the offline source of truth. Change the schema only by appending to `MIGRATIONS` in `schema.ts`.
- `android/` — native project, committed. Edit it by hand only when needed (e.g. `AndroidManifest.xml`); run `npx cap sync android` after adding plugins.
- `.github/workflows/release.yml` — every push to `main` builds a signed APK and publishes a GitHub release that installed apps self-update from.

## Commands

```bash
npm run dev        # browser preview at localhost:5173 (SQLite via wasm)
npm run typecheck
npm test           # node --test on src/**/*.test.ts
npm run build      # typecheck + production web build into dist/
npx cap sync android
```

Run typecheck and tests before declaring any task done. Local APK builds need JDK 21 + Android SDK; CI does it otherwise.

## Updates

- Web-only changes ship as live updates (downloaded in the background, applied on next app start).
- If you add/upgrade a native plugin or touch `android/`, bump `versionCode` in `android/app/build.gradle` so installed apps are told to download the new APK instead.
