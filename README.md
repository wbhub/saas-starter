# LedgerLift SaaS Starter

LedgerLift is a production-ready SaaS starter built with Next.js App Router, Supabase Auth/Postgres, and Stripe subscriptions. It includes a polished landing page, auth flow, protected dashboard, billing actions, and webhook-based subscription sync.

## Stack

- Next.js 15+ (App Router) + TypeScript
- Tailwind CSS
- Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- Stripe (`stripe`, `@stripe/stripe-js`)
- Vercel-ready deployment structure

## Features

- Branded landing page (navbar, hero, features, pricing, FAQ, footer)
- Signup/login/logout with session persistence
- Protected dashboard with account + billing state
- Stripe Checkout, plan changes, and Billing Portal
- Stripe webhook syncing subscription status into Supabase
- Supabase schema with RLS and user-scoped policies

## Pricing

- Starter: `$25/month`
- Growth: `$50/month`
- Pro: `$100/month`

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

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Required values:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_GROWTH_PRICE_ID`
- `STRIPE_PRO_PRICE_ID`

## Local Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. In Supabase Auth settings:
   - Enable Email provider.
   - Set Site URL to your app URL (local/dev/prod).
   - Add redirect URL: `http://localhost:3000/auth/callback`.
4. Put Supabase keys in `.env.local`.

## Stripe Setup

1. Create 3 recurring prices in Stripe:
   - Starter ($25/mo)
   - Growth ($50/mo)
   - Pro ($100/mo)
2. Add each price ID to `.env.local`.
3. Configure webhook endpoint:
   - Local: `http://localhost:3000/api/stripe/webhook`
   - Production: `https://<your-domain>/api/stripe/webhook`
4. Subscribe webhook events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

## Local Webhook Testing

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the returned signing secret into `STRIPE_WEBHOOK_SECRET`.

## Vercel Deployment

1. Push repo to GitHub.
2. Import project in Vercel.
3. Set all environment variables in Vercel Project Settings.
4. Update `NEXT_PUBLIC_APP_URL` to your deployed URL.
5. Add the deployed Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`.
6. Deploy.

## GitHub Setup

### What is a branch?

A branch is an isolated line of development. Use `main` as your stable production branch, and build new work in feature branches (for example `feature/initial-saas-app`) before merging back.

### Recommended workflow

1. Initial scaffold commit on `main`
2. Future changes on feature branches
3. Merge tested feature branches into `main`

### Git init and first commit

```bash
git init
git add .
git commit -m "feat: initial LedgerLift SaaS starter with Supabase and Stripe"
git branch -M main
```

### Flow A: Create GitHub repo using `gh`

```bash
gh repo create ledgerlift-saas-starter --public --source=. --remote=origin --push
```

### Flow B: Existing GitHub repo URL with `git remote add`

```bash
git remote add origin https://github.com/<your-username>/ledgerlift-saas-starter.git
git push -u origin main
```

### Future feature branch flow

```bash
git checkout -b feature/initial-saas-app
# make changes
git add .
git commit -m "feat: improve <area>"
git push -u origin feature/initial-saas-app
```
