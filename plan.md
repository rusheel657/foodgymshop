# Food + Gym + Shop — Implementation Plan

Private, minimalist Android app (APK). Three tabs — **Food**, **Gym**, **Shop** — plus **Profile**.
Built for one user now; an email allowlist lets friends in later without a rewrite.

Facts below were checked on 2026-10-28. Versions confirmed at scaffold: Expo SDK 58, React Native 0.88.

---

> **Stack change (2026-10-29):** the app was rebuilt with **Capacitor 8 + Vite + React** instead of Expo (the Expo version is kept at git tag `expo-final`).
> Local DB is `@capacitor-community/sqlite`; sign-in uses the in-app browser + the `foodgymshop://auth` deep link; APKs are built by GitHub Actions and published as GitHub releases;
> installed apps self-update (web bundle in the background via `@capawesome/capacitor-live-update`, or a prompt to download a new APK when native code changed).
> Where this plan says Expo / EAS / Expo Go, read the Capacitor equivalent above.

## 1. Stack (all free tiers)

| Concern | Choice | Why / limit |
|---|---|---|
| App | **Expo SDK 58** (React Native 0.88, TypeScript), `expo-router` native tabs | Latest SDK (released 2026-10-15). Android now, iOS later from same code. |
| On-device data | `expo-sqlite` — **source of truth** | Offline-first; gym never needs signal. |
| Backend | **New, dedicated Supabase project** (free) | Free plan allows **2 active projects** → no sharing with your other app. 500 MB DB, 1 GB storage, 500k Edge Function calls, 50k MAU. Pauses after 1 week inactivity — fine with daily use. |
| Auth | Supabase Auth + Google via **browser sign-in** (`signInWithOAuth` + `expo-web-browser`, redirect back to the app) | Works in Expo Go and the APK. Uses the Web client only — no Android client / SHA-1. Allowlist of emails + Google "Testing" test users. |
| Photo AI | **Gemini `gemini-3.8-flash`** (free: 5/min, **20/day**) → on rate-limit error, automatic fallback to `gemini-3.5-flash-lite` (free: 15/min, 500/day). Called only from a Supabase Edge Function | Key never ships in the APK. Free tier: inputs may be used by Google to improve products (accepted). Limits read from AI Studio on 2026-10-28. |
| Food macros | **USDA FoodData Central** (via Edge Function proxy, free key) + **Open Food Facts** barcode lookup (no key, direct) | |
| Exercises | **free-exercise-db** (Unlicense / public domain, 800+ exercises, JPG images) | Bundle the JSON; load images from `raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<path>`, cached by `expo-image`, shown greyscale. |
| Photo storage | Supabase Storage bucket `meal-photos` (compressed ~512px JPEG) | ImageKit dropped — not needed. |
| Crash reporting | Sentry free Developer plan (`@sentry/react-native`) | |
| Builds / updates | EAS Build (free tier) or local build → APK; **EAS Update** for over-the-air JS updates | |

**Why not Firebase:** Cloud Functions and new Cloud Storage buckets need the pay-as-you-go (Blaze) plan with a card on file. Supabase does everything above with no card.
**Not used:** Vercel (no website), Trigger.dev (no long jobs), ImageKit.

> **Development runs in Expo Go** (`npm start` → scan with the Expo Go app): no cloud builds or queue during development. Every library in this plan is included in Expo Go. Only the final APK (Phase 8) needs a build. A development-build APK from Phase 1 is installed as a backup.

---

## 2. Data model

Every synced table has: `id uuid` (generated on the phone), `user_id uuid`, `updated_at timestamptz` (set by phone, used for last-write-wins), `deleted_at timestamptz null` (soft delete so deletions sync), and on the server `synced_at timestamptz` (set by trigger, used as the pull cursor). Server has RLS: `user_id = auth.uid()`.

| Table | Key fields |
|---|---|
| `profile` | sex, birth_date, height_cm, activity_level (1.2/1.375/1.55/1.725/1.9), goal (`lose`/`gain`/`maintain`), goal_weight_kg, rate_kg_week (0.25/0.5/0.75), protein_g_per_lb (0.8–1.0), carb_ratio (0–1, fat = 1 − carb), calorie_override (null = auto) |
| *(device-local, not synced)* | theme (`dark` default / `light`) in `expo-sqlite/kv-store` |
| `weight_logs` | date (unique per user), weight_kg |
| `foods` (My Diet) | name, kcal/protein/carbs/fat **per 100 g**, default_grams, source (`usda`/`off`/`manual`), source_id, barcode, shop_unit, shop_qty |
| `meals` | name, ref_photo_paths (text[] , max 2) |
| `meal_items` | meal_id, food_id, grams |
| `food_logs` | logged_at, meal_id (null), photo_path (null), source (`photo`/`quick`) |
| `food_log_items` | food_log_id, food_id (null if estimated), name, grams, kcal, protein, carbs, fat, verified (bool) |
| `exercises` | name, primary_muscle, equipment, image_path, is_custom, default_rest_s (built-ins seeded locally only; only custom ones sync) |
| `templates` | name, sort_order |
| `template_exercises` | template_id, exercise_id, sort_order, rest_s |
| `template_sets` | template_exercise_id, sort_order, reps, weight_kg, is_warmup |
| `workouts` | template_id (null), started_at, ended_at |
| `workout_sets` | workout_id, exercise_id, exercise_order, set_order, weight_kg, reps, is_warmup, completed_at |
| `allowed_emails` (server only) | email |
| `ai_calls` (server only) | user_id, created_at — per-user daily cap |

Food log items store their macros as copied at log time, so editing a food later doesn't rewrite history.

---

## 3. Core maths (pure functions, unit-tested)

- **BMR (Mifflin-St Jeor):** `10·kg + 6.25·cm − 5·age + (male ? 5 : −161)`
- **Maintenance:** BMR × activity factor
- **Target kcal:** maintenance ± `rate_kg_week × 7700 / 7` (− for lose, + for gain); `calorie_override` wins if set
- **Protein g:** `protein_g_per_lb × current_kg × 2.20462`
- **Carbs g:** `(target − protein·4) × carb_ratio / 4`; **Fat g:** `(target − protein·4) × (1 − carb_ratio) / 9`
- **Est. 1RM (Epley):** `w × (1 + reps/30)`; PRs ignore warm-ups
- **Warm-up generator:** from first working set weight W → 50%×10, 70%×5, 85%×3, rounded to nearest 2.5 kg, drop sets < bar/empty
- **Volume:** Σ weight × reps of completed non-warm-up sets
- **New weight logged:** recompute targets; if they changed, prompt "Targets changed: X → Y kcal. Apply?"

---

## 4. Photo → macros flow

1. Camera (`expo-image-picker` camera mode) → compress to ~1024px for AI, ~512px for storage (`expo-image-manipulator`).
2. Offline? Show "No connection — quick-add instead." (no queue).
3. App calls Edge Function `analyze-meal` with: photo, list of My Diet foods `{id, name}`, Meals `{id, name, items}` and up to 1 reference photo per meal (cap ~10 meals).
4. Function: verifies JWT → checks `ai_calls` daily cap (default 50/day) → calls Gemini with a JSON response schema:
   `items: [{ meal_id|null, food_id|null, name, grams, kcal?, protein?, carbs?, fat?, confidence }]`
   Prompt rule: *if it matches a Meal, return the meal and its stored portions — never guess grams for a known meal. Only estimate macros for things not in the list.*
5. App builds the confirm screen: matched items get macros computed **from local data** (verified); unknown items use Gemini's estimate and show **UNVERIFIED**. Every gram value is editable; items can be removed/added.
6. "Log" → write locally → sync uploads photo + rows later.

Gemini failure / cap hit → error text + quick-add button. Model ID lives in one function constant so it can change without an app update.

---

## 5. Sync (offline-first)

- Local tables mirror server tables plus a `dirty` flag.
- **Push:** upsert all `dirty` rows (batched per table, parents before children), clear flag on success.
- **Pull:** select rows where `synced_at > last_pull_cursor`; apply if incoming `updated_at` ≥ local `updated_at` (last-write-wins).
- Runs on: app start, app foreground, after a workout ends, after logging food, and a manual "Sync now" in Profile. Never blocks the UI.
- Photos: upload pending `photo_path`s after their row syncs.
- Single user → conflicts are rare; LWW is enough. *shortcut: LWW per row, upgrade to per-field merge only if multi-device editing becomes real.*

---

## 6. Phases

Each phase ends with something you can use on the phone.

### Phase 0 — Accounts & tools (you, ~1 hour, guided)
- [x] Node, Git, adb present; Android Studio skipped (builds run on EAS).
- [x] Create **new** Supabase project (separate from your other app). Note URL + anon key.
- [x] Google Cloud project → Google Auth Platform (External, Testing, you as test user) → **Web** client ID with the Supabase callback URL. Client ID/secret pasted into Supabase → Auth → Google.
- [x] Google AI Studio → Gemini API key. Check free limits in AI Studio's rate-limit page.
- [x] api.data.gov → USDA FoodData Central key.
- [x] Expo account (`eas login`).
**Done when:** all keys are in a password manager, none in chat or git.

### Phase 1 — Skeleton on your phone
- [x] `npx create-expo-app@latest` (SDK 58), TypeScript, `expo-router`, git repo.
- [x] Theme tokens: black/white/greys + one muted green accent; dark default, light toggle (Profile).
- [x] Tabs: Food · Gym · Shop · Profile (Material icons, empty states).
- [x] `expo-sqlite` with numbered SQL migrations (`PRAGMA user_version`); all tables from §2. Self-check: `npm run test:schema`.
- [x] EAS project linked; `development` + `preview` APK profiles in `eas.json`; Android keystore created by EAS.
- [x] Runs on your phone in Expo Go (development-build APK also installed as a backup).
- [x] Checked: free-exercise-db images render greyscale with the `filter: 'grayscale(1)'` style.
**Done when:** app opens on your phone with 4 empty tabs in both themes.

### Phase 2 — Auth, onboarding, targets
- [x] `supabase/allowlist.sql`: `allowed_emails` + **before-user-created auth hook** rejecting other emails. *(You: run it in SQL Editor, enable the hook, add redirect URLs `exp://**` and `foodgymshop://**`.)*
- [x] Browser Google sign-in (PKCE) → session persisted in `expo-sqlite` localStorage. Rejected email → message on the sign-in screen.
- [x] Onboarding: one scrolling form — sex, birth date, height, weight, activity, goal + goal weight + rate, protein slider (0.8–1.0 g/lb), carb/fat slider with live grams, summary, optional calorie override.
- [x] Targets maths in `lib/targets.ts` + unit tests (`npm test`, Node's built-in runner — no Jest).
- [x] Profile: edit all of the above; theme toggle; sign out. Weight change → today's `weight_logs` entry.
- [ ] Tested on phone: sign in, onboarding, targets, edit, sign out.
**Done when:** fresh install → Google → onboarding → Food tab shows correct targets; returning launch skips onboarding.

### Phase 3 — My Diet + Shop
- [ ] Edge Function `usda-search` (proxies key; returns name + macros per 100 g).
- [ ] Add food: USDA search · barcode scan (`expo-camera` barcode mode → Open Food Facts) · manual. Always editable.
- [ ] Meals: name, items (food + grams), up to 2 reference photos.
- [ ] Shop tab: every My Diet food with unit, `−  qty  +`, "Clear list".
**Done when:** your 10–12 foods and regular meals are entered; shopping list works offline.

### Phase 4 — Food logging
- [ ] Food tab: targets vs totals (kcal ring + P/C/F bars), today's timeline, date switcher for history.
- [ ] Quick-add: pick food/meal → grams → log.
- [ ] Edge Function `analyze-meal` (§4) with daily cap.
- [ ] Camera button → confirm screen (verified / UNVERIFIED rows, editable) → log.
- [ ] Edit / delete a logged entry.
**Done when:** photo of your lamb bowl logs as "Lamb bowl, 500 g lamb + 4 eggs" with your stored macros; an unknown dish logs as unverified.

### Phase 5 — Gym core
- [ ] Seed exercises from bundled free-exercise-db JSON; search + muscle filter; custom exercise (name, muscle, optional photo).
- [ ] Templates: exercises, sets × reps × weight, rest seconds per exercise, reorder.
- [ ] Workout mode: elapsed timer at top; per set row `Previous | kg | reps | ✓`, pre-filled from last time; add/remove sets & exercises; mark set as warm-up; "Generate warm-ups" button.
- [ ] ✓ → rest timer bar (±15 s, skip). Schedule a local notification + vibration at end time (`expo-notifications`, `expo-haptics`) so it fires with screen off.
- [ ] Workout state saved to SQLite on every change → survives app kill.
- [ ] Finish: summary; if structure changed → "Update template?".
**Done when:** a full real session logged on your phone with screen locked between sets.

### Phase 6 — History, stats, weight, export
- [ ] Workout history list (date, duration, volume) + detail.
- [ ] Per-exercise history + PRs (heaviest, best est. 1RM) + est. 1RM line chart (`react-native-svg`, no chart library).
- [ ] Weight log: add entry, trend line, "Apply new targets?" prompt.
- [ ] Export: all tables → one JSON file → share sheet (`expo-file-system` + `expo-sharing`).
**Done when:** you can see last week's progress and export a file.

### Phase 7 — Sync
- [ ] Server tables mirroring §2 + RLS (`user_id = auth.uid()`) + `synced_at` triggers (moved here from Phase 2: nothing uses them before sync).
- [ ] Sync engine (§5) + unit tests for push/pull/LWW/soft-delete.
- [ ] Photo uploads to `meal-photos` bucket (private, per-user folder policy).
- [ ] "Last synced" + "Sync now" in Profile.
- [ ] Test: airplane mode during a workout → reconnect → server has every set.
**Done when:** uninstall → reinstall → sign in → all data returns.

### Phase 8 — Ship
- [ ] Sentry account (free) → React Native project → DSN into `.env`; wire JS + native crashes, upload source maps on build.
- [ ] Copy `.env` public values into EAS environment variables (`.env` is git-ignored, so cloud builds don't see it).
- [ ] `eas build -p android --profile preview` → APK installed on phone.
- [ ] EAS Update channel configured; push a trivial change and confirm it arrives.
**Done when:** v1 definition met (below).

---

## 7. Testing & definition of done

**Unit tests (required):** targets maths, warm-up generator, 1RM/PRs/volume, Gemini response → confirm-screen mapping, sync merge rules.
**On-device checklist:** onboarding, photo log (known + unknown), quick-add, airplane-mode workout, rest notification with screen off, theme switch, export, reinstall-restore.
**v1 done =** APK on your phone, all three tabs used daily for one full week, zero lost data.

## 8. Out of scope for v1
Health Connect, widgets, social, water tracking, supersets, plate calculator, payments, iOS build.

## 9. Assumptions
1. One muted green accent; everything else greyscale; dark default.
2. No deadline.
3. Weight changes prompt before targets change.
4. Photo logging needs internet; no offline queue.
5. Gemini free tier OK despite Google using inputs to improve products.
6. Warm-up weights round to 2.5 kg.
7. AI daily cap 50 calls/user (first 20 on 3.8 Flash, rest on 3.5 Flash Lite).
8. Sentry deferred to Phase 8 (not needed to start building).

## 10. Open risks
1. Browser sign-in redirect URLs differ between Expo Go and the APK → both must be on Supabase's allow list.
2. Gemini free-tier limits/model names change → model ID kept in the Edge Function only.
3. Android battery optimisation may delay rest notifications on some phones → test on yours; may need "exclude from battery optimisation".
4. ~~Greyscale image filter on Android~~ — confirmed working.
5. Free Supabase project pauses after 1 week idle — only matters on long breaks.
6. Hand-written sync is the most complex code → covered by tests in Phase 7.
