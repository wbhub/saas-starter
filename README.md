# SaaS Starter

A production-ready Next.js SaaS foundation built to help you launch faster:

- Full authentication flows (email/password + social SSO) and protected app routes out of the box
- Team-based SaaS model with role-based access (`owner`, `admin`, `member`)
- Monetization-ready billing with optional seat-based Stripe subscriptions
- Built-in support workflows (Resend required for support + custom transactional email)
- Optional AI features with provider-agnostic chat via Vercel AI SDK
- Internationalization-ready UX with locale routing and message catalogs
- System-aware theming with light and dark mode support
- Security-first defaults (CSRF protection, rate limiting, secure headers, CSP)

## Project Docs

- `DESIGN_SYSTEM.md` - layout, responsiveness, UI composition, and extension rules
- `ARCHITECTURE.md` - system structure and data flow
- `CONVENTIONS.md` - coding conventions and implementation patterns
- `MAGIC_NUMBERS.md` - rationale for important numeric limits and thresholds

## Tech Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS 4
- Supabase
- Resend (Required for full email features)
- Stripe (Recommended)
- Vercel AI SDK (optional)
- Intercom (optional)
- Redis (optional)
- Trigger.dev (optional)
- Sentry (optional)

## Prerequisites

Required:

- Node.js 20+ and npm
- A Supabase project
- A Resend account/API key

Optional (only if you enable these features):

- Stripe account + Stripe CLI (billing)
- AI provider API key (AI chat)
- Trigger.dev project/API credentials (background job offloading)
- Intercom workspace/app (in-app messenger)
- Upstash Redis account (shared rate limiting/cache across instances)
- Sentry account (error monitoring)

## Required Environment Variables

Boot required:

- `SUPABASE_SECRET_KEY`

Resend (set these correctly; email flows still degrade gracefully if misconfigured):

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_SUPPORT_EMAIL`

Local fallbacks (still set these correctly in production):

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Use `.env.example` as the source of truth for all available variables.

## Enable by Feature (Optional)

- Billing: Stripe (`BILLING_PROVIDER=stripe` + Stripe env vars). Set `APP_FREE_PLAN_ENABLED=true` to allow a free tier alongside paid plans.
- AI chat + structured output: Vercel AI SDK (`AI_PROVIDER` + provider keys). Optional tool integrations: `E2B_API_KEY` (sandboxed code execution), `TAVILY_API_KEY` (web search), `FIRECRAWL_API_KEY` (web scraping), `COMPOSIO_API_KEY` (Composio Sessions for third-party tools + in-chat auth). No built-in tool is registered by default; tool-calling becomes available once at least one integration is configured. Optional resumable streams: `AI_RESUMABLE_STREAMS_ENABLED=true` (requires Redis).
- In-app messenger: Intercom (`NEXT_PUBLIC_INTERCOM_APP_ID`, `INTERCOM_IDENTITY_SECRET`)
- Multi-instance rate limiting/cache: Redis via Upstash (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
- Background job offloading: Trigger.dev (`TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`)
- Error monitoring: Sentry (`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_ENVIRONMENT`)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy environment template:

```bash
cp .env.example .env.local
```

3. Create a Supabase project, then run `supabase/schema.sql` in the Supabase SQL Editor.

For this repo, `supabase/schema.sql` is the only setup script you need.

4. In Supabase Auth settings:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

5. Fill `.env.local` (see required variables above).
6. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## What You Get

- Public/auth pages: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/privacy-policy`, `/terms-of-use`, `/onboarding`
- App pages: `/dashboard`, `/dashboard/team`, `/dashboard/settings`, `/dashboard/billing`
- Optional pages: `/dashboard/billing`, `/dashboard/ai`
- Team invite flow: `/invite/[token]`
- API routes for auth, onboarding, teams, billing, AI, support email, and cron tasks
- Built-in localization (8 bundled locales) via `next-intl`
- Theme toggle with system, light, and dark modes

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
- (Optional) For monthly/annual billing toggle, also set:
  - `STRIPE_STARTER_ANNUAL_PRICE_ID`
  - `STRIPE_GROWTH_ANNUAL_PRICE_ID`
  - `STRIPE_PRO_ANNUAL_PRICE_ID`

Local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### Social SSO (Google / Microsoft)

- In Supabase Auth, enable the providers you want to offer:
  - Google for Google SSO
  - Azure for Microsoft SSO
- Configure each provider's client ID/secret in Supabase and make sure the redirect URL points to `${NEXT_PUBLIC_APP_URL}/auth/callback` (for local dev: `http://localhost:3000/auth/callback`).
- Enable the corresponding UI toggles in your env:
  - `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`
  - `NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED=true`
- Only turn the UI flags on after the provider is configured in Supabase; the app does not auto-detect missing OAuth credentials.

### Vercel AI SDK (AI Chat + Structured Output)

If you want `/dashboard/ai` and `/api/ai/chat`:

- Set provider env vars:
  - `AI_PROVIDER` (`openai`, `anthropic`, or `google`)
  - `AI_PROVIDER_API_KEY` (or provider fallback key)
- Fallback provider keys:
  - OpenAI: `OPENAI_API_KEY`
  - Anthropic: `ANTHROPIC_API_KEY`
  - Google: `GOOGLE_GENERATIVE_AI_API_KEY`
- Note: attachment `fileId` sources are OpenAI-only; for other providers, use `url` or `data`.
- (Recommended) Set `AI_MODEL_MODALITIES_MAP_JSON` so model capability checks are explicit per provider/model
- Configure AI policy vars in `.env.example` (`AI_ACCESS_MODE`, plan/model/budget settings)
- AI file uploads are capped server-side at 25 MiB per file, with about 256 KiB of extra multipart overhead allowed before the route buffers the body. See `MAGIC_NUMBERS.md` for the rationale.
- (Optional) Enable agent tool-calling: set `AI_TOOLS_ENABLED=true` and `NEXT_PUBLIC_AI_TOOLS_ENABLED=true`. Tool-calling only activates when at least one tool integration is configured. Set `AI_MAX_STEPS` to control how many steps the agent loop can take per request (default 5 when tool-calling is active). When tools are disabled or no integrations are configured, chat remains single-turn. Tools are defined in `lib/ai/tools/`. Per-plan `maxSteps` can be configured via `AI_PLAN_RULES_JSON`.
- (Optional) Tool integrations (each enabled when its API key is set):
  - `E2B_API_KEY` -- isolated code execution via E2B Code Interpreter
  - `TAVILY_API_KEY` -- web search via Tavily
  - `FIRECRAWL_API_KEY` -- web scraping via Firecrawl
  - `COMPOSIO_API_KEY` -- third-party actions (GitHub, Slack, etc.) via Composio
- (Optional) Resumable streams: set `AI_RESUMABLE_STREAMS_ENABLED=true` (requires Redis) to enable reconnecting to interrupted AI streams.

**Persisted threads:** Chat conversations are automatically saved to the database (`ai_threads` + `ai_thread_messages` tables). Threads are private to the signed-in user within their current team; teammates share AI access and team usage limits, but not each other's chat history. The thread sidebar in `/dashboard/ai` allows creating, switching, and deleting conversation threads. Thread API routes: `GET/POST /api/ai/threads`, `GET/PATCH/DELETE /api/ai/threads/[threadId]`, `GET /api/ai/threads/[threadId]/messages`.

**Structured output (`/api/ai/object`):** A second AI endpoint streams typed JSON objects using `streamObject` + `useObject`. No extra env vars needed -- it inherits all AI config from the chat setup. Define schemas in `lib/ai/schemas/` and register them in `AI_SCHEMA_MAP`. Three schemas are included: sentiment analysis, entity extraction, and content classification. See `components/ai-object-card.tsx` for client usage.

### Intercom

- Set `NEXT_PUBLIC_INTERCOM_APP_ID` and `INTERCOM_IDENTITY_SECRET` for messenger boot + identity verification

### Redis (Upstash)

- Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for multi-instance rate limiting and team-context caching

### Trigger.dev Background Jobs

- Set `TRIGGER_SECRET_KEY` to enable Trigger dispatch from webhook/cron/email/retry flows.
- Set `TRIGGER_PROJECT_REF` for Trigger CLI/deploy configuration (`trigger.config.ts`).
- If `TRIGGER_SECRET_KEY` is unset, background work runs inline exactly as before.
- Existing cron endpoints remain available as a fallback path.

### Sentry

- Set `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, and `SENTRY_ENVIRONMENT` for frontend/server error reporting

## Scripts

- `npm run dev` - development server
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - ESLint
- `npm run lint:conventions` - check env usage, response helpers, and route wrapper conventions
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
- Theme behavior: `components/theme-provider.tsx`, `components/theme-toggle.tsx`
