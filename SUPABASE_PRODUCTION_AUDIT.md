# Khamark — Supabase Architecture & Production Security Audit

**Document Version:** 1.0.0  
**Target Backend:** Supabase (PostgreSQL 17+ / PostgREST)  
**Project ID:** `utttnhpdzsdwgkneqrnq` (`khamark`)  
**Evaluated Date:** October 27, 2026  
**Auditor Framework:** Official Supabase Skill & Security Checklist

---

## 1. Architecture Overview

Khamark uses Supabase as its primary backend, replacing legacy cloud infrastructure with an integrated PostgreSQL architecture:

```mermaid
graph TD
    Client["Khamark Mobile App (Expo SDK 54 / RN 0.81)"]
    PostgREST["Data API (PostgREST)"]
    Auth["Supabase Auth (GoTrue)"]
    Storage["Storage Engine (S3 / media)"]
    Edge["Edge Functions (Deno)"]
    DB[("PostgreSQL Database")]

    Client -->|anon key + Bearer JWT| PostgREST
    Client -->|auth.signUp / signIn| Auth
    Client -->|upload / download media| Storage
    Client -->|askChatbot / push / payment| Edge
    PostgREST -->|Row-Level Security (RLS)| DB
    Auth -->|users trigger| DB
    Edge -->|service_role / authenticated| DB
```

---

## 2. Supabase Security Checklist Verification

### 2.1 Auth & Session Authorization
- [x] **No Authorization from `user_metadata`:** Privilege checks never rely on client-editable `raw_user_meta_data`. User roles are stored in `public.users` (`role`, `is_admin`, `is_partner`) and evaluated via the security definer function `public.is_admin()`.
- [x] **Privilege Escalation Protection:** Trigger `trg_prevent_privilege_escalation` on `public.users` raises an exception if a non-superuser / client-side update attempts to modify `is_admin`, `role`, `is_partner`, or `is_blocked`.
- [x] **Safe Account Deletion (Apple Guideline 5.1.1(v)):** The `public.delete_user()` function runs with `SECURITY DEFINER set search_path = public, auth, pg_temp` and explicitly validates `auth.uid() is not null` before deleting the authenticated user from `auth.users`, cascading to profile rows and cleaning up sessions.

---

### 2.2 API Key & Client Secret Handling
- [x] **No Service Role Keys in App:** Client code only references `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The `service_role` key is strictly kept in server-side Edge Functions and protected environment variables.
- [x] **Protected Environment Files:** `.env` is excluded from git tracking via `.gitignore`. A clean template is provided in `.env.example`.

---

### 2.3 Row-Level Security (RLS) & Exposed Schemas

Row-Level Security is enabled across all application tables in the `public` schema:

| Table | Exposed to Data API? | RLS Policy Model | Security Evaluation |
| :--- | :--- | :--- | :--- |
| `public.parts` (Products) | Yes | **Public Read (`true`) / Admin Write (`public.is_admin()`)** | ✅ Safe. Anonymous shoppers browse products; only store admins write/update. |
| `public.orders` (Orders) | Yes | **User Self-Select (`auth.uid() = user_id or public.is_admin()`) / Insert / Admin Update** | ✅ Safe. Customers cannot see others' orders. Update is restricted to administrators (`orders_admin_update`). |
| `public.users` (Profiles) | Yes | **Self-Select (`auth.uid() = id or public.is_admin()`) / Self-Update / Insert** | ✅ Safe. Privilege fields protected by trigger. |
| `public.carts` (Carts) | Yes | **Self-Access (`auth.uid() = user_id`)** | ✅ Safe. User isolated via `USING` and `WITH CHECK`. |
| `public.addresses` (Addresses)| Yes | **Self-Access (`auth.uid() = user_id`)** | ✅ Safe. User isolated via `USING` and `WITH CHECK`. |
| `public.brands` (Brands) | Yes | **Public Read (`true`) / Admin All (`public.is_admin()`)** | ✅ Safe. Public catalog data. |
| `public.banners` (Banners) | Yes | **Public Read (`true`) / Admin All (`public.is_admin()`)** | ✅ Safe. Public catalog data. |
| `public.categories` (Cats) | Yes | **Public Read (`true`) / Admin All (`public.is_admin()`)** | ✅ Safe. Public catalog data. |
| `public.discounts` (Coupons) | Yes | **Public Read (`true`) / Admin All (`public.is_admin()`)** | ✅ Safe. |
| `public.store_locations` | Yes | **Public Read (`true`) / Admin All (`public.is_admin()`)** | ✅ Safe. Public store branch addresses. |
| `public.tenants` | Yes | **Public Read (`true`) / Admin All (`public.is_admin()`)** | ✅ Safe. |

---

### 2.4 Privileged Database Functions (Security Definer)

All `SECURITY DEFINER` functions in `supabase/khamark_schema.sql` follow Supabase security best practices:
1. **Explicit Search Path:** Every function sets `set search_path = public` (or `set search_path = public, auth, pg_temp`) to prevent search path hijacking.
2. **Revocation from Public:**
   - `public.delete_user()`: `REVOKE ALL FROM public, anon; GRANT EXECUTE TO authenticated;`
   - `public.cancel_my_order(uuid)`: `REVOKE ALL FROM public, anon; GRANT EXECUTE TO authenticated;`
   - `public.delete_my_order(uuid)`: `REVOKE ALL FROM public; GRANT EXECUTE TO authenticated;`
3. **Internal Authorization Checks:**
   - `create_counter_sale`: Checks `auth.uid() is not null`, verifies `is_admin`, and verifies `owner_id = auth.uid()`.
   - `cancel_my_order`: Verifies `v_order.user_id = auth.uid()` and restores stock atomically if deducted.

---

### 2.5 Storage Access Control
- Bucket name: `media`
- Read: `media_public_read` on `storage.objects` (`bucket_id = 'media'`).
- Upload: `media_insert` on `storage.objects` (`bucket_id = 'media' and auth.role() = 'authenticated'`).
- Update / Delete: `media_update` and `media_delete` on `storage.objects` for authenticated users.

---

## 3. Deployment & Operational Commands

### 3.1 Project Linking
```bash
# Link repository to Khamark Supabase project
npx supabase link --project-ref utttnhpdzsdwgkneqrnq
```

### 3.2 Schema Deployment Status: ✅ APPLIED
The consolidated single-file schema [`supabase/khamark_schema.sql`](file:///Users/maci/Desktop/Asankary%20copy/supabase/khamark_schema.sql) was successfully applied directly to the Khamark remote database (`utttnhpdzsdwgkneqrnq`) on October 27, 2026:
- **CLI Execution:** Executed via `npx supabase db query --linked -f supabase/khamark_schema.sql` (Exit code: 0).
- **Wildcard Policy Elimination:** Cleaned up and dropped 21 dangerous development `permissive_all` (`USING (true) WITH CHECK (true)`) policies that previously bypassed RLS.
- **RLS Enforced:** Verified active Row Level Security and least-privilege policies across all 24 tables in `public`.
- **Functions Registered:** Verified `is_admin()`, `prevent_privilege_escalation()`, `delete_user()`, `move_part_stock()`, `cancel_my_order()`, `delete_my_order()`, `create_counter_sale()`, `email_exists()`, `account_id_for_phone()`.
- **Storage:** `media` bucket verified public read (20MB limit) with authenticated write policies.

### 3.3 Admin User Provisioning
To provision the first admin:
1. Register the store owner account via the app or Supabase Authentication -> Users.
2. Open [`supabase/khamark_create_admin.sql`](file:///Users/maci/Desktop/Asankary%20copy/supabase/khamark_create_admin.sql).
3. Set line 15 to the admin's email or phone number.
4. Execute via CLI (`npx supabase db query --linked -f supabase/khamark_create_admin.sql`) or Dashboard SQL Editor.

### 3.4 Edge Functions Deployment
```bash
# Deploy AI shopping assistant
npx supabase functions deploy askChatbot

# Deploy Push Notification dispatcher
npx supabase functions deploy send-push

# Deploy DB change listener (Webhooks)
npx supabase functions deploy on-db-change --no-verify-jwt

# Deploy Auth helper functions
npx supabase functions deploy login --no-verify-jwt
npx supabase functions deploy resetPassword --no-verify-jwt
```
