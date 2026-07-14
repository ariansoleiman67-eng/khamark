# Supabase — new project migration

This folder holds the schema and migration plan for moving Asankary fully
off Firebase onto a **brand-new Supabase project**. The app is **live**, so we use a
strangler migration: the new project runs alongside Firebase, one slice moves at a
time, nothing is deleted until the replacement is proven in production.

## Apply the schema to the new project

1. Create the new project in the Supabase dashboard.
2. Link it locally (needs the Supabase CLI):
   ```bash
   npx supabase link --project-ref <new-project-ref>
   npx supabase db push
   ```
   Or: open Supabase Studio → SQL Editor → paste `migrations/20260101000000_initial_schema.sql` → Run.
3. Update `src/services/supabase.ts` with the **new** project URL + anon key.

## Migration phases (sequence: safe → risky)

1. **Schema** ✅ `migrations/20260101000000_initial_schema.sql` (this file's sibling).
2. **Data layer** — move the 24 Firestore-reading files to Supabase; dual-write during transition.
3. **Push** — FCM tokens → `devices`/`push_tokens` tables + a sender; keep delivery working.
4. **Backend** — port `functions/src/index.ts` (~30 functions) to Edge Functions.
   Blockers: `sharp` image processing (no Deno equivalent) and payments need a dedicated decision.
5. **Auth** — Firebase Auth → Supabase Auth. Riskiest. Social/phone re-link by email; export
   password hashes. Users created in `auth.users` BEFORE inserting into `public.users` (FK).
6. **Cutover** — flip RLS to the production block in the schema file, then delete Firebase.

## Open decisions before later phases
- Backend host for `sharp` + payments (Edge Functions can't run sharp): keep one Firebase
  Function, or move image processing to a small container / Supabase + external service.
- Push transport: native FCM vs Expo Push.

- push token for same issue at local new file for image soruce 00 hash tag §122 new scroll 
- sharp new for at list call of road junk be trash al colrder 
