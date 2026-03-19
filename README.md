# SaaS Starter – Next.js + Supabase + Stripe

This repo is a small SaaS starter app:

- Marketing/landing page with pricing
- Email/password auth (Supabase)
- Forgot password flow (Resend + Supabase recovery link)
- Protected dashboard that shows the logged‑in user, active team, and team subscription state
- Stripe subscriptions (3 plans) with checkout, plan changes, and billing portal
- Team invite flow (owners/admins can invite members by email)
- Team member removal flow (owners/admins can remove members; seat billing re-syncs)
- Resend-powered dashboard support email form
- Optional: Intercom chat widget

You can clone it, rename it, and use it as the base for your own SaaS.

## Prerequisites

- Node.js 18+ (this uses Next.js App Router)
- A Supabase project with:
  - Email auth enabled
  - The schema from `supabase/schema.sql` applied
- A Stripe account with 3 recurring subscription prices (Starter/Growth/Pro)
- A Resend account (and a verified `RESEND_FROM_EMAIL` for production)
- Stripe CLI installed locally (for local webhook testing)
  - Example: `brew install stripe/stripe-cli/stripe`

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

5. **Create a Resend account + sender**
   - Create an API key in Resend and set `RESEND_API_KEY`.
   - Verify a sending domain (or use a Resend test sender while developing).
   - Set:
     - `RESEND_FROM_EMAIL` (must be in the format `Name <email@domain.com>`, for example `SaaS Starter <onboarding@resend.dev>`)
     - `RESEND_SUPPORT_EMAIL` (where support messages should be delivered)

6. **Set the rest of your `.env.local`**

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
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `RESEND_SUPPORT_EMAIL`
   - `NEXT_PUBLIC_INTERCOM_APP_ID` (optional, for Intercom)
   - `INTERCOM_IDENTITY_SECRET` (required if Intercom identity verification is enabled)
   - `STRIPE_SEAT_PRORATION_BEHAVIOR` (optional: `create_prorations` or `none`; default `create_prorations`)
   - `TRUST_PROXY_HEADERS` (`true` only when your deployment is behind a trusted proxy)

7. **Run Stripe webhook locally (recommended for full flow)**

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   Keep this running in a separate terminal; it forwards Stripe events to your local app.

   Copy the returned signing secret (it includes `whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
   If signature verification fails, double-check you used the latest signing secret shown by `stripe listen`.

8. **Start the dev server**

   ```bash
   npm run dev
   ```

9. **Open the app**
   - Visit `http://localhost:3000` for the landing page.
   - Use **Sign up** / **Log in**.
   - After logging in, you’ll be taken to the protected dashboard and can start a subscription.

---

## 2. Tech stack (what’s inside)

- Next.js 16+ (App Router) + TypeScript
- Tailwind CSS
- Supabase (Auth + Postgres)
- Stripe (subscriptions, billing portal)
- Resend (transactional/support email delivery)
- Vercel‑ready deployment

## Team model (multi-member)

This starter now uses a team-based data model:

- Every new user gets a default team and an `owner` membership via `handle_new_user()`.
- Billing is team-scoped (`stripe_customers.team_id`, `subscriptions.team_id`), so multiple team members share the same subscription state.
- Billing is per-seat: Stripe subscription item quantity follows active team member count.
- Team memberships are role-based (`owner`, `admin`, `member`) and enforced via RLS (`is_team_member(...)`).
- `profiles.active_team_id` controls which team context the app uses for dashboard/billing actions.
- If a user loses all memberships, they can recover a personal team from the dashboard.
- Invite flow:
  - `POST /api/team/invites` creates + emails an invite link (owner/admin only)
  - `/invite/[token]` lets an authenticated user accept via `POST /api/team/invites/accept`

If your database was created with the old single-user schema, migrate in this order:

1. Run `supabase/migrate-single-user-to-teams.sql` once (backfills team rows + team ids).
2. Then run `supabase/schema.sql` to apply the full team-based schema + policies.

## Available scripts

- `npm run dev` (development)
- `npm run build` (production build)
- `npm run start` (run built app)
- `npm run lint` (eslint)
- `npm run test` (run unit tests)
- `npm run test:watch` (watch mode tests)

## Project Structure

```txt
app/
  api/
    auth/
      forgot-password/route.ts
    resend/
      support/route.ts
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
  forgot-password/page.tsx
  reset-password/page.tsx
  signup/page.tsx
  globals.css
  layout.tsx
  page.tsx
components/
  auth-form.tsx
  billing-actions.tsx
  forgot-password-form.tsx
  landing-page.tsx
  reset-password-form.tsx
  support-email-card.tsx
lib/
  env.ts
  resend/
    server.ts
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
3. Set **all** environment variables in Vercel Project Settings (same as `.env.local`, but with production values).
   - `NEXT_PUBLIC_APP_URL` → your Vercel URL (for example `https://your-app.vercel.app`)
   - `STRIPE_WEBHOOK_SECRET` → from the Stripe webhook (configured in the next step)
   - The rest (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_*_PRICE_ID`, `RESEND_*`, `NEXT_PUBLIC_INTERCOM_APP_ID`, `INTERCOM_IDENTITY_SECRET`, `STRIPE_SEAT_PRORATION_BEHAVIOR`, `TRUST_PROXY_HEADERS`) should match your local `.env.local`.
4. Update Supabase Auth redirect settings for production:
   - Set **Site URL** to `https://your-app.vercel.app`
   - Add redirect URL: `https://your-app.vercel.app/auth/callback`
5. Configure Stripe webhooks for production:
   - Create a webhook endpoint pointing to `https://<your-domain>/api/stripe/webhook`
   - Select these events (at least):
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Copy the webhook signing secret shown by Stripe into `STRIPE_WEBHOOK_SECRET`.
6. Deploy.

---

## Deployment checklist

Before your first real customer signs up, confirm:

- Vercel environment variables are set (all `NEXT_PUBLIC_*` + server-side secrets).
- Supabase Auth redirect URL matches your production domain (`/auth/callback`).
- Stripe webhook endpoint + `STRIPE_WEBHOOK_SECRET` are correct (so events are verified).
- `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, and `STRIPE_PRO_PRICE_ID` point to the prices you intend to sell.
- Resend delivery is configured: `RESEND_FROM_EMAIL` is verified and `RESEND_SUPPORT_EMAIL` routes to your inbox.
- Optional Intercom: `NEXT_PUBLIC_INTERCOM_APP_ID` and `INTERCOM_IDENTITY_SECRET` are set if you want verified Intercom identity in production.
- `TRUST_PROXY_HEADERS` is only enabled if your deployment injects trusted proxy IP headers.
- **CSP (production):** After deploy, confirm the root [`proxy.ts`](proxy.ts) runs and sets `Content-Security-Policy`. A successful `next build` lists **Proxy (Middleware)** in the build summary; that is this file. Quick check against your live origin (HTML page, not a JSON API):

  ```bash
  curl -sI https://YOUR_DOMAIN/ | grep -i content-security-policy
  ```

  You should see a single CSP header whose `script-src` includes a `nonce-` token in production. `next.config.ts` adds other security headers (`Strict-Transport-Security`, `X-Frame-Options`, etc.) for all routes; CSP nonces and Supabase/Stripe/Intercom allowances are applied in `proxy.ts`.

- **Stripe webhook dedupe cleanup (optional):** The webhook handler opportunistically prunes old rows in `stripe_webhook_events`. For low-traffic apps, add a scheduled job (e.g. Vercel Cron) that calls `GET /api/cron/prune-stripe-webhook-events` with `Authorization: Bearer <CRON_SECRET>`. Set `CRON_SECRET` in the environment; if it is unset, the route returns 503.
- **Seat reconciliation cron (recommended):** Add a scheduled job that calls `GET /api/cron/reconcile-seat-quantities` with `Authorization: Bearer <CRON_SECRET>`. This reconciles Stripe subscription quantity against current team member counts, drains the durable `seat_sync_retries` queue, and self-heals missed seat syncs.

---

## JSON API responses (convention)

New and hardened routes should prefer shared helpers in [`lib/http/api-json.ts`](lib/http/api-json.ts):

- Success: `{ "ok": true, ... }` (extra fields allowed).
- Client errors and most failures: `{ "ok": false, "error": "message" }` with an appropriate HTTP status.

Older routes may still return `{ "error": "..." }` without `ok`; migrate gradually when touching an endpoint.

---

## Trusted proxy header requirements

Rate-limited auth/support endpoints use client IP when `TRUST_PROXY_HEADERS=true`. Enable this only when your edge/load balancer enforces trusted forwarding headers.

- Keep `TRUST_PROXY_HEADERS=false` unless requests always pass through trusted infrastructure.
- Your proxy must remove any incoming spoofed forwarding headers from the public request and then set its own canonical client IP header.
- Set `TRUSTED_PROXY_HEADER_NAMES` to the exact header(s) your proxy controls (comma-separated, in priority order).
- If multiple proxies are involved, ensure the outermost trusted proxy rewrites the header chain consistently.

Example:

```env
TRUST_PROXY_HEADERS=true
TRUSTED_PROXY_HEADER_NAMES=x-forwarded-for
```

If this is misconfigured, attackers can spoof IPs and weaken rate limits.

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
2. Generate an **Identity Verification secret** in Intercom.
3. Set both in `.env.local`:
   - `NEXT_PUBLIC_INTERCOM_APP_ID`
   - `INTERCOM_IDENTITY_SECRET`
4. Restart your dev server.

Intercom only loads when `NEXT_PUBLIC_INTERCOM_APP_ID` is set.

When configured, the app loads Intercom globally and boots with server-verified Supabase user data:
- `user_id` = Supabase `user.id`
- `email` = Supabase `user.email`
- `name` = Supabase `user.user_metadata.full_name` (if present)
- `created_at` = Supabase `user.created_at` (converted to a Unix timestamp)
- `user_hash` = HMAC-SHA256 signature generated on the server (`INTERCOM_IDENTITY_SECRET`)

Note: Intercom will receive these values (PII), so make sure it aligns with your privacy policy.

---

## 6. Resend support email flow

The dashboard includes an **Email support (Resend)** card that sends user messages to your support inbox.

- Route: `POST /api/resend/support`
- Access: authenticated users only
- Validation: message length 10-2000 chars
- Delivery:
  - `from` = `RESEND_FROM_EMAIL`
  - `to` = `RESEND_SUPPORT_EMAIL`

If `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, or `RESEND_SUPPORT_EMAIL` are missing, the API route returns a clear configuration error.

Production note: `RESEND_FROM_EMAIL` must be verified in Resend (otherwise delivery will fail).

---

## 7. Forgot password flow (Resend + Supabase)

The auth flow includes a custom forgot password implementation that uses **Resend** for delivery.

- Request page: `/forgot-password`
- Request endpoint: `POST /api/auth/forgot-password`
- Reset page: `/reset-password`

How it works:

1. User enters their email on `/forgot-password`.
2. The API route creates a Supabase recovery link via Admin API.
3. The app sends that link through Resend to the user.
4. Link returns through `/auth/callback`, which exchanges the code for a session and redirects to `/reset-password`.
5. User sets a new password, then signs in with the updated credentials.

Security notes:

- The request endpoint always returns a generic success message (to avoid leaking whether an email exists). Link generation and email delivery run **after** the HTTP response via Next.js `after()`, so response time does not reflect whether Supabase/Resend work succeeded—monitor logs/alerts for `Forgot-password:` / `Failed to generate` / `Failed to send` instead of relying on a 503 from this route.
- Password updates require a valid recovery session from the email link.
- `POST /reset-password/submit` is rate limited per client identifier (same distributed limiter as other auth routes).

---

## 8. Legal pages (footer, privacy policy, terms of use)

This starter now includes filled default legal text and footer branding so you can run the app without placeholder tokens.

Before production, review and update these files for your legal entity and jurisdiction:

- `components/site-footer.tsx`
- `app/privacy-policy/page.tsx`
- `app/terms-of-use/page.tsx`

## Launch notes (branding & pricing)

Besides the legal pages, you’ll likely want to customize:

- Branding and marketing copy (search for “SaaS Starter”): `components/site-header.tsx`, `components/landing-page.tsx`, and the auth pages in `app/*/page.tsx`.
- Plan display names/prices shown to users: `components/landing-page.tsx` (pricing cards) and billing labels in `lib/stripe/config.ts` / `lib/stripe/plans.ts`. Actual checkout billing still uses the `STRIPE_*_PRICE_ID` env vars.

Note: this starter provides example text only—review it with legal counsel for your jurisdiction.
