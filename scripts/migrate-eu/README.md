# Moving Asankary's Supabase project from Seoul to London

**Why:** measured from Erbil on 2026-10-12, Seoul (`ap-northeast-2`) is 317 ms per round trip. London (`eu-west-2`) is 103 ms, about 3× closer. Zurich, Paris and Ireland measured within a few ms of London. A single small API call took ~400 ms warm and ~1.07 s cold against Seoul. The app makes several calls at start-up, so every one of them pays that distance.

**How:** Supabase cannot change a project's region. We create a new project and copy everything into it, rehearse against it, then switch over. Nothing changes for customers until step 6.

The **old project** is `ucopzrdubjnyfprbaqus`. The **new project** is `<new-ref>` in this guide; replace it everywhere below.

> Passwords and keys go into **your terminal only**, never into chat or into a file in this repo. Every `export` below sets a variable for that terminal window only.

---

## 1 · Create the new project (you)

Supabase dashboard → **New project**:

- **Organisation:** the same as Asankary.
- **Name:** `Asankary EU`.
- **Region:** **West EU (London)**.
- **Database password:** generate one and save it in your password manager.

Then, in the new project, go to **Database → Extensions** and enable **`pg_net`**. The notification triggers need it, and the restore below expects it.

## 2 · Copy the database, including customer logins

1. Start **Docker Desktop**. The Supabase copy tool runs inside it, so there is nothing to install.
2. Get both connection strings: each project → **Connect** → **Session pooler** → URI. Put your password in place of `[YOUR-PASSWORD]`.

```bash
export OLD_DB_URL='postgresql://postgres.ucopzrdubjnyfprbaqus:PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'
export NEW_DB_URL='postgresql://postgres.<new-ref>:PASSWORD@aws-0-eu-west-2.pooler.supabase.com:5432/postgres'

mkdir -p ~/asankary-migration && cd ~/asankary-migration
npx supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
npx supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
npx supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only

# Restore into the NEW project. psql runs in the official Postgres image.
docker run --rm -v "$PWD":/work -w /work postgres:17 \
  psql --single-transaction --variable ON_ERROR_STOP=1 \
       --file roles.sql --file schema.sql \
       --command 'SET session_replication_role = replica' \
       --file data.sql --dbname "$NEW_DB_URL"
```

`data.sql` includes `auth.users`, so **customer accounts and passwords move too**. Customers will still need to sign in once after the switch, because the new project issues new session tokens.

## 3 · Copy the media files and rewrite every link

The bucket is `media`: 339 files on 2026-10-12, made up of product photos, category and brand logos, and the banner.

```bash
cd /Users/maci/Desktop/Asankary
export OLD_URL=https://ucopzrdubjnyfprbaqus.supabase.co
export NEW_URL=https://<new-ref>.supabase.co
export OLD_SERVICE_ROLE_KEY='…'   # old project → Settings → API → service_role
export NEW_SERVICE_ROLE_KEY='…'   # new project → Settings → API → service_role

node scripts/migrate-eu/copy-media.mjs --dry-run   # count only
node scripts/migrate-eu/copy-media.mjs             # copy (safe to re-run)

# Rewrite stored links AND the trigger functions that call Edge Functions by URL.
docker run --rm -v "$PWD":/work -w /work postgres:17 \
  psql "$NEW_DB_URL" -v old_ref=ucopzrdubjnyfprbaqus -v new_ref=<new-ref> \
       -f scripts/migrate-eu/rewrite-project-refs.sql
```

The last query must print no rows. Any row it prints is a function that still points at Seoul.

## 4 · Server functions, secrets and login settings

Deploy **this repo's** functions. Do not deploy the three that exist only in HAryad (`chatAutoReply`, `huawei-auth`, `syncStoreVersion`); nothing calls them.

```bash
R=<new-ref>
for f in askChatbot send-push create-qicard-payment check-qicard-status \
         login payment-complete phone-otp-session resetPassword; do
  npx supabase functions deploy $f --project-ref $R
done
for f in on-db-change ai-auto-reply verifyAdminActionPassword send-sms-otp qicard-webhook; do
  npx supabase functions deploy $f --no-verify-jwt --project-ref $R
done
```

Secrets: the same values as in the old project. Supabase only shows their names, not their values, so take each value from where it was created.

```bash
npx supabase secrets set --project-ref $R \
  ANTHROPIC_API_KEY='…' ANTHROPIC_MODEL=claude-sonnet-5 \
  FCM_SERVICE_ACCOUNT="$(cat path/to/firebase-service-account.json)" \
  OTPIQ_API_KEY='…' OTPIQ_PROVIDER=auto \
  FIREBASE_WEB_API_KEY='…'
```

Dashboard, **new** project. Copy each of these from the old project's same page:

- **Authentication → Providers:** Phone (on), Email, and Google with the same client IDs and secrets.
- **Authentication → Hooks → Send SMS:** HTTPS, URL `https://<new-ref>.supabase.co/functions/v1/send-sms-otp`. Generate the secret, then `npx supabase secrets set SEND_SMS_HOOK_SECRET='v1,whsec_…' --project-ref $R`.
- **Authentication → URL Configuration:** the same Site URL and Redirect URLs, including `asankary://` and the `asankare.com` ones.
- **Database → Publications** (realtime): check the same tables are listed as in the old project (notifications, messages, conversations …).

## 5 · Rehearsal (together)

Point the simulator build at the new project with a temporary `.env.local` holding the new `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, then test:

- browsing and photos;
- sign in with email, with phone code, and forgot password;
- cart → order → the admin "New order" alert → status change → the customer's alert;
- chat and the AI reply, the AI assistant, and the Category Manager.

Fix anything found. This first London project is the **rehearsal**: delete it afterwards and repeat steps 1–4 for real at cut-over. With these scripts that takes about an hour, and it guarantees a clean copy with no test data in it.

## 6 · Cut-over (a quiet hour)

Over-the-air updates are **off** in this app (`EXUpdatesEnabled = false`), so phones move to the new server through a store update:

1. Build a version whose `.env` points at the new project. Submit both stores with **manual release**: App Store "Manually release this version", Play "Managed publishing". Let them be approved.
2. At the quiet hour: run steps 1–4 for real.
3. Release both store versions, and redeploy the website with the new URL and key.
4. In the **old** project's `app_config`, set `forceUpdate: true` with `minAppVersion` / `minBuildNumber` / `minVersionCode` = the new version. Old apps then say "update required", so no order can land on the old server.
5. Keep the old project, untouched, for a week as a backup, then pause it.
