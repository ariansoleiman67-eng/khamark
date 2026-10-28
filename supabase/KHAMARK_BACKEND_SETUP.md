# Khamark — Supabase Backend Setup & Connection Guide

This document provides step-by-step instructions to set up a brand-new, independent Supabase backend for **Khamark** and connect the application.

---

## 1. Create a New Supabase Project

1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New Project**.
3. Choose your organization and name the project: `Khamark` (or `khamark-app`).
4. Generate and save a strong database password securely.
5. Select the closest AWS Region (e.g. Frankfurt `eu-central-1` or Bahrain `me-south-1`).
6. Click **Create new project** and wait 1–2 minutes for provisioning to finish.

---

## 2. Apply the Consolidated Database Schema

1. In your Supabase Project Dashboard, navigate to **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file `supabase/khamark_schema.sql` from this codebase, copy all its contents, and paste into the SQL editor.
4. Click **Run** (or `Cmd + Enter`).
5. Confirm that all tables, triggers, RPCs, storage buckets (`media`), and RLS policies are created successfully without errors.

---

## 3. Configure Supabase Authentication

In the left sidebar, navigate to **Authentication** -> **URL Configuration**:

1. **Site URL**:
   ```
   https://khamark.com
   ```

2. **Redirect URLs** (Add each of these):
   ```
   khamark://*
   khamark://auth-callback
   khamark://reset-password
   khamark://payment-complete
   https://khamark.com/*
   exp://*
   ```
   *(Note: `exp://*` allows deep link testing in Expo Go / Dev Client during development).*

3. Under **Authentication** -> **Providers** -> **Email**:
   - Ensure Email provider is enabled.
   - If you want users to be able to sign in immediately without waiting for confirmation emails, turn off **Confirm email**.
   - If using Google Sign-In, configure Google provider with your Web Client ID and secret.

---

## 4. Provision the Initial Store Owner & Admin

1. In Supabase Dashboard -> **Authentication** -> **Users**, click **Add user** -> **Create user**.
2. Enter the admin's email (e.g., `admin@khamark.com`) and a temporary password (or register directly through the Khamark mobile app).
3. Open `supabase/khamark_create_admin.sql` in this codebase.
4. Replace `'admin@khamark.com'` on line 14 with the actual email or phone number used.
5. In Supabase Dashboard -> **SQL Editor**, paste and run `khamark_create_admin.sql`.
6. You will see a notice: `Successfully promoted user ... to Khamark Store Owner & Admin!`.

---

## 5. Deploy Supabase Edge Functions (Optional but Recommended)

For AI chatbot assistance and automated push notifications:

1. Install Supabase CLI locally if not already installed:
   ```bash
   npm install -g supabase
   ```
2. Link the repository to your new Khamark project:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-khamark-project-ref>
   ```
3. Set your Edge Function secrets:
   ```bash
   # Anthropic Claude API Key for the Khamark Assistant:
   npx supabase secrets set ANTHROPIC_API_KEY="sk-ant-api..."
   
   # Optional: QiCard payment gateway credentials (if card payment is enabled):
   npx supabase secrets set QICARD_API_HOST="https://uat-sandbox-3ds-api.qi.iq/api/v1"
   npx supabase secrets set QICARD_USERNAME="your_username"
   npx supabase secrets set QICARD_PASSWORD="your_password"
   npx supabase secrets set QICARD_TERMINAL_ID="your_terminal_id"
   npx supabase secrets set QICARD_PUBLIC_BASE="https://khamark.com"
   ```
4. Deploy the functions:
   ```bash
   npx supabase functions deploy askChatbot
   npx supabase functions deploy ai-auto-reply --no-verify-jwt
   npx supabase functions deploy login
   npx supabase functions deploy resetPassword
   npx supabase functions deploy payment-complete --no-verify-jwt
   ```

---

## 6. Connect the Application

1. In Supabase Dashboard, navigate to **Project Settings** -> **API**.
2. Copy the **Project URL** and the `anon` `public` **Project API Key**.
3. Open `.env` in the root of the project:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-project-anon-key>
   EXPO_PUBLIC_USE_MOCK_DATA=false
   EXPO_PUBLIC_BRAND_NAME=Khamark
   EXPO_PUBLIC_DEFAULT_CURRENCY=IQD
   EXPO_PUBLIC_DEFAULT_LANGUAGE=en
   EXPO_PUBLIC_QI_CARD_ENABLED=false
   ```
4. Start the app:
   ```bash
   npm run start
   ```
5. The red "Configuration Unavailable" banner will automatically disappear once a valid Supabase project URL and anon key are loaded. The application will connect directly to your new Khamark Supabase backend.
