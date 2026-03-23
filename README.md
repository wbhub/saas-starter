# SaaS Starter

A straightforward Next.js SaaS starter with:

- Supabase auth + database
- Team accounts (`owner`, `admin`, `member`)
- Optional Stripe billing (seat-based)
- Optional AI chat (provider-agnostic via Vercel AI SDK)
- Resend email (support + password reset)
- Security defaults (CSRF, rate limiting, secure headers)

## Tech Stack

- Next.js 16, React 19, TypeScript
- Supabase
- Stripe (optional)
- Vercel AI SDK + provider adapters (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) (optional)
- Resend
- Tailwind CSS 4
- `next-intl` with locales: `en`, `es`, `fr`, `pt`, `zh`

## Prerequisites

Required:

- Node.js 20+ and npm
- A Supabase project
- A Resend account (for support + password reset email)

Optional (only if you enable these features):

- Stripe account + Stripe CLI (billing)
- AI provider API key (AI chat)
- Upstash Redis account (shared rate limiting/cache across instances)
- Sentry account (error monitoring)

## What You Get

- Public/auth pages: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`
- App pages: `/dashboard`, `/dashboard/team`, `/dashboard/settings`, `/dashboard/usage`
- Optional pages: `/dashboard/billing`, `/dashboard/ai`
- Team invite flow: `/invite/[token]`
- API routes for auth, teams, billing, AI, support email, and cron tasks

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy environment template:

```bash
cp .env.example .env.local
```

3. Create a Supabase project, then run:

- `supabase/schema.sql` in Supabase SQL Editor

4. In Supabase Auth settings:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

5. Fill `.env.local` (see required variables below).

6. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Required Environment Variables

These are required at boot:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_SUPPORT_EMAIL`

These have local fallbacks, but should still be set correctly:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Use `.env.example` as the source of truth for all available variables.

## Optional Setup

### Stripe Billing

Default mode is free-only (`BILLING_PROVIDER=none`).

To enable Stripe:

- Set `BILLING_PROVIDER=stripe`
- Set:
  - `STRIPE_SECRET_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_STARTER_PRICE_ID`
  - `STRIPE_GROWTH_PRICE_ID`
  - `STRIPE_PRO_PRICE_ID`

Local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### AI Chat

If you want `/dashboard/ai` and `/api/ai/chat`:

- Set provider env vars:
  - `AI_PROVIDER` (`openai`, `openai-compatible`, `anthropic`, or `google`)
  - `AI_PROVIDER_API_KEY` (or provider fallback key)
  - `AI_PROVIDER_BASE_URL` (required for `openai-compatible`)
- Fallback provider keys:
  - OpenAI: `OPENAI_API_KEY`
  - Anthropic: `ANTHROPIC_API_KEY`
  - Google: `GOOGLE_GENERATIVE_AI_API_KEY`
- Note: attachment `fileId` sources are OpenAI-only; for other providers, use `url` or `data`.
- (Recommended) Set `AI_MODEL_MODALITIES_MAP_JSON` so model capability checks are explicit per provider/model
- Configure AI policy vars in `.env.example` (`AI_ACCESS_MODE`, plan/model/budget settings)

### Other Integrations

- Upstash Redis (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) for multi-instance rate limiting and team-context caching
- Intercom (`NEXT_PUBLIC_INTERCOM_APP_ID`, `INTERCOM_IDENTITY_SECRET`) for messenger boot + identity verification
- Sentry (`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_ENVIRONMENT`) for frontend/server error reporting

## Scripts

- `npm run dev` - development server
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - ESLint
- `npm run typecheck` - TypeScript check
- `npm run test` - Vitest (once)
- `npm run test:watch` - Vitest (watch)
- `npm run test:e2e:smoke` - Playwright smoke tests
- `npm run test:e2e` - Playwright full tests
- `npm run test:e2e:ui` - Playwright UI mode

## Deploy (Vercel)

1. Import repo in Vercel.
2. Add env vars.
3. Configure Supabase auth URLs for production.
4. If using Stripe, set webhook to `/api/stripe/webhook`.
5. (Optional) Configure scheduled calls to cron endpoints with `CRON_SECRET`.
6. Deploy.

## Customize

- Landing/branding: `components/landing/`
- Legal pages: `app/privacy-policy/page.tsx`, `app/terms-of-use/page.tsx`
- Locales/messages: `i18n/routing.ts`, `messages/*.json`
