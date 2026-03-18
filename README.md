# SaaS Starter – Next.js + Supabase + Stripe

This repo is a small SaaS starter app:

- Marketing/landing page with pricing
- Email/password auth (Supabase)
- Protected dashboard that shows the logged‑in user and their subscription state
- Stripe subscriptions (3 plans) with checkout, plan changes, and billing portal
- Optional: Intercom chat widget

You can clone it, rename it, and use it as the base for your own SaaS.

---

## 1. Quick start (local)

Follow these steps in order:

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Copy env file**

   ```bash
   cp .env.example .env.local
   ```

3. **Create a Supabase project**
   - Go to Supabase, create a new project.
   - In the SQL editor, run the contents of `supabase/schema.sql`.
   - In Auth settings:
     - Enable **Email** provider.
     - Set **Site URL** to `http://localhost:3000`.
     - Add redirect URL: `http://localhost:3000/auth/callback`.
   - Grab:
     - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
     - anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

4. **Create Stripe products/prices**
   - Create 3 recurring prices in Stripe:
     - Starter (`$25/month`)
     - Growth (`$50/month`)
     - Pro (`$100/month`)
   - Copy their **price IDs** into:
     - `STRIPE_STARTER_PRICE_ID`
     - `STRIPE_GROWTH_PRICE_ID`
     - `STRIPE_PRO_PRICE_ID`
   - Create an API key and set:
     - `STRIPE_SECRET_KEY`
     - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

5. **Set the rest of your `.env.local`**

   Required variables:

   - `NEXT_PUBLIC_APP_URL` → `http://localhost:3000` for local
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_WEBHOOK_SECRET` (see next step)
   - `STRIPE_STARTER_PRICE_ID`
   - `STRIPE_GROWTH_PRICE_ID`
   - `STRIPE_PRO_PRICE_ID`
   - `NEXT_PUBLIC_INTERCOM_APP_ID` (optional, for Intercom)

6. **Run Stripe webhook locally (recommended for full flow)**

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   - Copy the returned signing secret into `STRIPE_WEBHOOK_SECRET`.

7. **Start the dev server**

   ```bash
   npm run dev
   ```

8. **Open the app**
   - Visit `http://localhost:3000` for the landing page.
   - Use **Sign up** / **Log in**.
   - After logging in, you’ll be taken to the protected dashboard and can start a subscription.

---

## 2. Tech stack (what’s inside)

- Next.js 15+ (App Router) + TypeScript
- Tailwind CSS
- Supabase (Auth + Postgres)
- Stripe (subscriptions, billing portal)
- Vercel‑ready deployment

## Project Structure

```txt
app/
  api/
    stripe/
      checkout/route.ts
      change-plan/route.ts
      portal/route.ts
      webhook/route.ts
  auth/callback/route.ts
  dashboard/
    actions.ts
    error.tsx
    loading.tsx
    page.tsx
  login/page.tsx
  signup/page.tsx
  globals.css
  layout.tsx
  page.tsx
components/
  auth-form.tsx
  billing-actions.tsx
  landing-page.tsx
lib/
  env.ts
  utils.ts
  stripe/
    config.ts
    plans.ts
    server.ts
    sync.ts
  supabase/
    admin.ts
    client.ts
    middleware.ts
    server.ts
supabase/
  schema.sql
public/
```

---

## 3. Deploying to Vercel

1. Push the repo to GitHub.
2. Import it in Vercel.
3. Set **all** environment variables in Vercel Project Settings (same as `.env.local`, but with production URLs/keys).
4. Set:
   - `NEXT_PUBLIC_APP_URL` → your Vercel URL (for example `https://your-app.vercel.app`)
   - Stripe webhook endpoint → `https://<your-domain>/api/stripe/webhook`
   - `STRIPE_WEBHOOK_SECRET` → from the Stripe webhook.
5. Deploy.

---

## 4. Stripe events (for reference)

When configuring your Stripe webhook, subscribe at least to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

---

## 5. Optional: Intercom

If you want to enable the Intercom chat widget:

1. Create (or open) your Intercom app and copy its **App ID**.
2. Set `NEXT_PUBLIC_INTERCOM_APP_ID` in `.env.local`.
3. Restart your dev server.

Intercom only loads when `NEXT_PUBLIC_INTERCOM_APP_ID` is set.

When set, the app loads Intercom globally and boots it with logged-in Supabase user data when available:
- `user_id` = Supabase `user.id`
- `email` = Supabase `user.email`
- `name` = Supabase `user.user_metadata.full_name` (if present)
- `created_at` = Supabase `user.created_at` (converted to a Unix timestamp)

Note: Intercom will receive these values (PII), so make sure it aligns with your privacy policy.
