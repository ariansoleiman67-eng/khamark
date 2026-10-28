# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Asankary — a React Native (0.81) / Expo (SDK 54, New Architecture enabled) mobile app selling consumer electronics and accessories in Iraq. Multilingual (English / Arabic / Kurdish) with RTL, multi-tenant admin model, and a customer + admin app in one binary. TypeScript strict mode.

Note: `README.md` is largely aspirational/marketing and describes an older Firebase-only design. Trust the code over the README — in particular the service layer and the backend split below.

## Commands

```bash
npm start                  # Expo dev server (Metro)
npm run android            # expo run:android (dev client — this is NOT Expo Go)
npm run ios                # expo run:ios
npm run lint               # ESLint over .js/.jsx/.ts/.tsx
npm run lint:fix
npm run type-check         # tsc --noEmit  (use this to validate changes; no test for most code)
npm test                   # jest
npx jest __tests__/utils/pricingUtils.test.ts   # run a single test file
npm run deploy:functions   # Firebase Cloud Functions — LEGACY, undeployable (project has no billing)
npx supabase functions deploy askChatbot   # the real thing: Supabase Edge Functions
```

Builds/updates go through EAS: `npm run build:android` / `build:ios` / `build:preview` (production/preview profiles in `eas.json`), and OTA via `npm run update:production` / `update:preview`. `postinstall` runs `npm install` inside `functions/`.

Test coverage is minimal — only `__tests__/utils/` exists. There is no jest preset configured, so most testing/verification happens via `type-check` and running the app.

## Architecture

### Hybrid backend (important)
The app is mid-migration from Firebase to Supabase. Both are live:

- **Supabase is the primary data store.** Products, orders, users, carts, addresses, tenants/admins, settings, notifications, chat — all live in Postgres. Client: `src/services/supabase.ts`. Schema lives in `schema.sql` and the many `update_schema_*.sql` files at repo root. DB columns are **snake_case**; services map them to camelCase domain types (see the `mapProduct` helper in `src/services/productService.ts` for the pattern every service follows).
- **Server-side compute is Supabase Edge Functions, NOT the `functions/` directory.** This is the single easiest thing to get wrong here, because the repo contains both. `src/services/safeCallFunction.ts` calls `supabase.functions.invoke`, so every server call the app makes lands in `supabase/functions/*` — `askChatbot` (Claude AI assistant), `login`, `resetPassword`, `phone-otp-session`, `verifyAdminActionPassword`, `send-push`, `send-sms-otp`, and the QiCard payment set. Deploy with `supabase functions deploy <name>`; secrets with `supabase secrets set`.
- **`functions/` (Firebase Cloud Functions) is superseded legacy.** No app code calls it — `askChatbot`'s own header records that the Supabase version "replaces the old Firebase askChatbot". The Firebase project has no billing account, so Cloud Functions have never been deployed and cannot be without enabling Blaze. Treat this directory as dead unless you are deliberately reviving it.
- **Firebase is still used natively, and costs nothing.** FCM delivers push (free, unlimited, no billing) and Firebase Auth backs the phone-OTP screens reached from phone login / forgot password / partner signup. `@react-native-firebase/{firestore,storage,app}` are installed but unused. Note the app runs two OTP systems in parallel: Firebase Auth on those screens, Supabase OTP (via an OTPIQ Send-SMS hook) elsewhere.
- **AI is Claude** (`claude-haiku-4-5`, `ANTHROPIC_API_KEY` as a Supabase secret). It replaced OpenAI for chat and Gemini for visual search. Haiku rejects the `effort` parameter and has no adaptive thinking — see the note in `supabase/functions/askChatbot/index.ts` before raising the model.
- Product video uses Bunny CDN; ImgBB and payment proxies live in the Firebase directory and are therefore also undeployed.

When adding data features, default to Supabase. Reach for a Cloud Function only for secrets/third-party proxies (Gemini, ImgBB, payments, email) or server-side triggers.

### Multi-tenancy
Admin-facing data is tenant-scoped. `src/contexts/TenantContext.tsx` resolves the logged-in admin's `tenantId` and exposes path helpers (`getProductsPath()`, `getOrdersPath()`, etc.). Rule (`GOLDEN_RULES.md`): never render admin screens without a `tenantId` — gate on it, and clear all tenant state on tenant change. `tenantId` must be part of queries, cache keys, and React keys.

### App composition
`App.tsx` is the single entry. It applies Android-only native patches **before** anything else (`src/ui/patchView`, `patchTextInput`, `androidGlobalFix` — these fix Samsung/Android Arabic text clipping and scroll bugs by mutating component `defaultProps`; keep them first). It then nests the provider tree, which is the source of global state:

```
ErrorBoundary → ThemeProvider → AuthProvider → TenantProvider →
CurrencyProvider → CartProvider → FavoritesProvider → NotificationProvider → AppNavigator
```

Each provider has a matching `useX()` hook in `src/contexts/` that throws if used outside its provider. There is no Redux/Zustand — Context + hooks + per-service AsyncStorage caching is the state model.

### Navigation
`src/navigation/AppNavigator.tsx` is the active root (React Navigation v7 native-stack + bottom-tabs). Auth, customer, and admin screens all live in one navigator; admin tabs are in `AdminTabNavigator.tsx`. `*Minimal.tsx` / `SimpleAppNavigator.tsx` are unused fallbacks. Deep links use the `asankary://` scheme and universal links for `ASANKARY_DOMAIN_TBD`.

### Layout / directory map
- `src/services/` — all backend access + business logic (class-based statics like `OrderService`, or exported functions). One file per domain.
- `src/screens/` — grouped by area: `auth/`, `admin/`, `main/`, `profile/`, `store/`, `messenger/`.
- `src/contexts/` — global providers (see tree above).
- `src/components/` — shared UI; `chat/`, `voice/`, `icons/` subfolders.
- `src/features/image-editor/` — self-contained feature module (own state/hooks/services).
- `src/constants/config.ts` — central config: `COLLECTIONS`, `PAGINATION`, `CACHE_EXPIRATION`, `ORDER_STATUS`, `IRAQI_CITIES`, etc. Prefer these constants over literals.
- `src/locales/{en,ar,ku}.json` + `src/locales/index.ts` — i18next setup.
- `supabase/functions/` — the Edge Functions the app actually calls. **Start here for anything server-side.**
- `functions/src/` — superseded Firebase Cloud Functions. Dead; see the backend note above.

## Conventions

`GOLDEN_RULES.md` records the team's hard UI conventions (note: parts of it are garbled, and its "no Reanimated" rule is contradicted by the codebase, which does use Reanimated). The reliably-enforced and useful rules:

- **One vertical scroll owner per screen** (a single `ScrollView`/`FlatList`/`FlashList`); never nest vertical scrollers; use `ListHeaderComponent` for headers.
- **RTL/text:** use `textAlign` + `I18nManager.isRTL`; never use `writingDirection: 'rtl'` (breaks Android). Numbers always render LTR (via the `AppNumber` component). Global auto-RTL is disabled in `App.tsx` — direction is controlled per-component.
- **Keyboard:** `SafeAreaView → KeyboardAvoidingView → ScrollView/FlatList`, with `keyboardShouldPersistTaps="handled"`. Never put `KeyboardAvoidingView` inside a `ScrollView`.
- **Sizing:** prefer `minHeight` and `aspectRatio` over fixed heights; card radius 12, padding `SPACING.md`.
- All user-facing strings go through i18next (`t('...')`) and must be added to all three locale files.

## Gotchas

- Repo root is cluttered with one-off migration/debug scripts (`fix_*.js`, `import_to_supabase.js`, `rescue-server.js`, `*.txt` logs, `update_schema_*.sql`). These are not part of the app build — don't treat them as app source.
- Many credential/key files are committed (`google-services.json`, `GoogleService-Info.plist`, `credentials.json`, `serviceAccountKey.json`, `.jks` keystores). Do not add more, and do not echo their contents.
- Expo 54 file-system deprecation warnings are intentionally silenced via `LogBox.ignoreLogs` in `App.tsx`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Asankary copy** (6799 symbols, 15055 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Asankary copy/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Asankary copy/clusters` | All functional areas |
| `gitnexus://repo/Asankary copy/processes` | All execution flows |
| `gitnexus://repo/Asankary copy/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
