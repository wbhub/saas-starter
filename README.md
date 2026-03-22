# SaaS Starter

Production-oriented Next.js SaaS starter with Supabase auth, Stripe billing, team access controls, AI chat, support email, and security defaults.

## In Plain English

This project gives you a working SaaS app foundation so you can focus on your product:

- People can sign up, log in, reset passwords, and manage account settings.
- Teams can invite members and assign roles (`owner`, `admin`, `member`).
- Billing is handled through Stripe with seat-based subscriptions (`Starter`, `Growth`, `Pro`).
- An optional AI chat endpoint can be enabled and gated by plan/rules.
- A support form sends emails through Resend.
- Security basics (CSRF, CSP, rate limiting, secure headers) are already wired in.

## What Is Included

UI routes:

- Public + auth: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`
- Invite acceptance: `/invite/[token]`
- Legal: `/privacy-policy`, `/terms-of-use`
- Protected app: `/dashboard`
  - `/dashboard/ai`
  - `/dashboard/billing`
  - `/dashboard/team`
  - `/dashboard/settings`
  - `/dashboard/usage`

Backend routes:

- Auth: `/auth/callback`, `/api/auth/login`, `/api/auth/signup`, `/api/auth/forgot-password`, `/reset-password/submit`
- Team: `/api/team/invites`, `/api/team/invites/accept`, `/api/team/invites/[inviteId]`, `/api/team/invites/[inviteId]/resend`, `/api/team/members/[userId]`, `/api/team/settings`, `/api/team/ownership/transfer`, `/api/team/recover-personal`
- Stripe: `/api/stripe/checkout`, `/api/stripe/portal`, `/api/stripe/change-plan`, `/api/stripe/webhook`
- AI: `/api/ai/chat`
- Support: `/api/resend/support`
- Cron: `/api/cron/reconcile-seat-quantities`, `/api/cron/prune-stripe-webhook-events`
- Intercom boot: `/api/intercom/boot`

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- Stripe (`stripe`, `@stripe/stripe-js`)
- Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`)
- Resend (`resend`)
- Tailwind CSS 4
- Internationalization: `next-intl` (locales: `en`, `es`; locale prefix disabled)
- Vitest, Playwright, ESLint
- Optional observability/runtime: Sentry, Upstash Redis

## Quick Start

1) Install dependencies:

```bash
npm install
```

2) Create your local env file:

```bash
cp .env.example .env.local
```

3) Set up Supabase:

- Create a project.
- Run `supabase/schema.sql` in Supabase SQL Editor.
- Configure Auth URLs:
  - Site URL: `http://localhost:3000`
  - Redirect URL: `http://localhost:3000/auth/callback`
- Optional social auth:
  - Enable provider(s) in Supabase.
  - Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` and/or `NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED=true`.

4) Set up Stripe:

- Create recurring prices for `Starter`, `Growth`, and `Pro`.
- Put IDs in:
  - `STRIPE_STARTER_PRICE_ID`
  - `STRIPE_GROWTH_PRICE_ID`
  - `STRIPE_PRO_PRICE_ID`

5) Set up Resend:

- Add `RESEND_API_KEY`
- Add `RESEND_FROM_EMAIL`
- Add `RESEND_SUPPORT_EMAIL`

6) Run Stripe webhook forwarding for local testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the generated `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

7) Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Copy `.env.example` and fill values.

Required:

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
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_SUPPORT_EMAIL`

Optional:

### AI

- `OPENAI_API_KEY` (required only if AI chat is enabled)
- `AI_ACCESS_MODE` (`paid`, `all`, `by_plan`; default `paid`)
- `AI_DEFAULT_MODEL` (used by `AI_ACCESS_MODE=all`)
- `AI_DEFAULT_MONTHLY_TOKEN_BUDGET` (used by `AI_ACCESS_MODE=all`)
- `AI_ALLOWED_MODALITIES` (comma-separated `text,image,file`; defaults to `text`)
- `AI_PLAN_RULES_JSON` (used by `AI_ACCESS_MODE=by_plan`; includes `free|starter|growth|pro` and optional `allowedModalities`)
- `AI_ALLOWED_SUBSCRIPTION_STATUSES` (used by `AI_ACCESS_MODE=paid`)
- `AI_PLAN_MODEL_MAP_JSON` (used by `AI_ACCESS_MODE=paid`)
- `AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON` (used by `AI_ACCESS_MODE=paid`)
- `AI_PLAN_MODALITIES_MAP_JSON` (used by `AI_ACCESS_MODE=paid`; per-plan modality override map)
- `APP_FREE_PLAN_ENABLED` (if `true`, teams without a live paid subscription resolve to `free`)

### Auth

- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`
- `NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED`

### Security and Infrastructure

- `CRON_SECRET`
- `TRUST_PROXY_HEADERS`
- `TRUSTED_PROXY_HEADER_NAMES`
- `UPSTASH_REDIS_REST_URL` (optional; enables Redis-backed rate limiting + team-context cache)
- `UPSTASH_REDIS_REST_TOKEN` (optional; required with URL)

### Stripe and Team Limits

- `STRIPE_SEAT_PRORATION_BEHAVIOR` (`create_prorations` or `none`)
- `TEAM_MAX_MEMBERS` (default `100`)

### Intercom

- `NEXT_PUBLIC_INTERCOM_APP_ID`
- `INTERCOM_IDENTITY_SECRET`

### Sentry

- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`
- `SENTRY_ENVIRONMENT`

### Testing and CI (optional)

- `PLAYWRIGHT_BASE_URL`
- `E2E_OWNER_EMAIL`
- `E2E_OWNER_PASSWORD`
- `E2E_MEMBER_EMAIL`
- `E2E_MEMBER_PASSWORD`
- `E2E_INVITE_TOKEN`

## Internationalization

- `next-intl` is configured with locales `en` and `es`.
- `localePrefix` is set to `never` (no locale segment in URLs).
- Automatic locale detection is enabled (Accept-Language/cookie/request locale).
- `lib/i18n/config.ts` currently has `SHOW_LOCALE_SWITCHER=false` by default.

## How Core Features Work

Team and auth model:

- New users get a personal team via DB trigger (`handle_new_user`).
- Active team context lives in `profiles.active_team_id`.
- Invites are create/resend/revoke + token-based acceptance.
- Dashboard team member/invite list queries are bounded by `TEAM_MAX_MEMBERS` to avoid unbounded reads.
- Only owners can transfer ownership.
- Account settings include profile, email change flow, notification preferences, and guarded account deletion.

Billing model:

- Team-scoped subscriptions (not user-scoped).
- Seat quantity is reconciled against team membership counts.
- Landing page pricing attempts to pull live Stripe prices for configured price IDs.
- Webhook events are deduplicated and stored in `stripe_webhook_events`.

AI chat model (`POST /api/ai/chat`):

- Authenticated users only.
- CSRF + JSON content-type enforced.
- Max JSON request size is `256KB` (`413` when exceeded).
- Input schema:
  - `messages` length: 1-30
  - each message `content`: 1-8000 chars
  - each message `attachments`: max 8
  - optional message `attachments`:
    - images: `image/png`, `image/jpeg`, `image/webp`, `image/gif`
    - files: `application/pdf`, `text/plain`, `text/csv`
    - each attachment must provide exactly one source: `url`, `data`, or `fileId`
    - `data` payload max length: `300000`
  - allowed roles: `user`, `assistant`
- Unsupported attachment MIME types are rejected with `400`.
- Modalities are policy-gated by `AI_ALLOWED_MODALITIES` with optional per-plan overrides.
- Streaming response (`text/plain; charset=utf-8`) with a 4096-token output cap.
- Model calls are executed through the Vercel AI SDK (`streamText`) with the OpenAI provider.
- Attachment inputs are normalized into AI SDK message parts (text/image/file) before model execution.
- Dashboard includes an AI chat workspace at `/dashboard/ai` built with `@ai-sdk/react` (`useChat` + `TextStreamChatTransport`).
- The dashboard AI workspace supports text messages and attachment upload (images and selected file types).
- Client-side attachment checks mirror API constraints (per-message attachment count, MIME allowlist, and encoded size guard).
- Client-side guards include per-file and total-attachment encoded-size limits to reduce `413` payload failures.
- To keep request payloads stable across multi-turn chats, only the latest user message's attachments are sent on each request.
- Client request shaping also aligns to API limits by sending only recent messages and bounding per-message content length.
- Rate limits are applied per-user and per-team.
- Budgeting can reserve/finalize tokens atomically via DB RPC.
- Usage is persisted to `ai_usage`; audit events log `success`/`denied`/`failure`.
- Budget finalize failures are queued for retry and drained by cron (plus best-effort processing on active AI requests).
- AI access can be controlled in three modes:
  - `paid`: plan/status-based (requires non-empty `AI_ALLOWED_SUBSCRIPTION_STATUSES`)
  - `all`: all authenticated users, one default model
  - `by_plan`: explicit rules for `free|starter|growth|pro`

Support + password reset emails:

- `POST /api/resend/support` sends authenticated support requests to `RESEND_SUPPORT_EMAIL`.
- `POST /api/auth/forgot-password` generates recovery links and sends reset emails via Resend.

Cron endpoints:

- Require `Authorization: Bearer <CRON_SECRET>`.
- `/api/cron/reconcile-seat-quantities`:
  - reconciles Stripe seat quantities
  - processes queued AI budget finalize retries
  - returns `500` if any internal cron job fails
- `/api/cron/prune-stripe-webhook-events` prunes webhook dedupe rows.

Security defaults:

- CSRF token cookie + header checks on mutating routes.
- Rate limiting uses optional Upstash Redis (when configured) for multi-instance enforcement, with fallback to existing DB/in-memory paths when unavailable.
- Team context lookups are cached (Redis when configured, otherwise in-memory TTL cache).
- Audit events are buffered and inserted in batches to reduce write amplification.
- `proxy.ts` adds CSP (nonce in production), request ID, CSRF cookie bootstrap, and Supabase session refresh.
- `next.config.ts` applies HSTS/XFO/nosniff/permissions/referrer headers and `Cache-Control: no-store` for `/api/*`.

## Database (Supabase)

Run `supabase/schema.sql` once in a new environment.

Core tables:

- `teams`, `team_memberships`, `profiles`
- `notification_preferences`
- `stripe_customers`, `subscriptions`
- `team_invites`
- `stripe_webhook_events`
- `rate_limit_windows`
- `audit_events`
- `ai_usage`
- `ai_usage_monthly_totals`
- `ai_usage_budget_claims`
- `ai_budget_claim_finalize_retries`
- `seat_sync_retries`

Important RPC functions used by app code:

- `check_rate_limit(...)`
- `sync_stripe_subscription_atomic(...)`
- `accept_team_invite_atomic(...)`
- `transfer_team_ownership_atomic(...)`
- `recover_personal_team_if_missing(...)`
- `claim_ai_token_budget(...)`
- `finalize_ai_token_budget_claim(...)`
- `enqueue_ai_budget_finalize_retry(...)`

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - run built app
- `npm run lint` - run ESLint
- `npm run typecheck` - run TypeScript checks
- `npm run test` - run Vitest once
- `npm run test:watch` - run Vitest in watch mode
- `npm run test:e2e:smoke` - run Playwright smoke suite
- `npm run test:e2e` - run full Playwright suite
- `npm run test:e2e:ui` - run Playwright in UI mode

## Testing and CI

- PR workflow runs Vitest always.
- Playwright smoke runs when required E2E secrets are configured.
- If those secrets are missing, CI skips Playwright and still runs Vitest.

### Playwright locally

- Smoke: `npm run test:e2e:smoke` (starts its own `npm run dev` unless you override below).
- **Do not** pass `--project=smoke` to `npm run test:e2e` — that script is wired to `--project=full` only. Use `test:e2e:smoke` for smoke.
- `PLAYWRIGHT_BASE_URL` — if set, Playwright will **not** start a dev server (use when the app is already running).
- `PLAYWRIGHT_REUSE_DEV_SERVER=true` — reuse an existing dev server on port 3000 instead of spawning one (default is **off** so a stuck/zombie process on `:3000` does not hang the runner).
- `E2E_LIVE_SIGNUP=true` — enables the optional Playwright test that performs a **real** Supabase signup and expects a redirect to `/dashboard` (requires valid Supabase env). Default smoke signup uses a mocked API response so CI/local runs without a real backend still pass.

## Deploy (Vercel)

1. Import the repo into Vercel.
2. Set required environment variables.
3. Configure Supabase Auth Site URL and callback URL for production.
4. Configure Stripe webhook to `/api/stripe/webhook` with `STRIPE_WEBHOOK_SECRET`.
5. (Optional) Configure scheduled calls to both cron endpoints with `CRON_SECRET`.
6. Deploy.

## Launch Checklist

- `supabase/schema.sql` has been applied.
- All required env vars are set.
- Stripe price IDs and webhook secret are correct.
- Resend sender is verified.
- Optional integrations (Intercom, Sentry, AI) are configured only if needed.
- `TRUST_PROXY_HEADERS` is enabled only in trusted proxy infrastructure.

## Customization Notes

- Update branding and landing copy in `components/landing/`.
- Update legal text in `app/privacy-policy/page.tsx` and `app/terms-of-use/page.tsx`.
- Keep Stripe price IDs in sync with your Stripe products.
