# SaaS Starter

Production-oriented Next.js SaaS starter with:

- Supabase auth + Postgres (team-based data model)
- Stripe subscriptions (Starter/Growth/Pro) with seat billing
- Team invites + role-based access control
- OpenAI streaming chat endpoint with plan/rate/budget gating
- Resend-powered support + password reset emails
- Optional Intercom identity verification
- Security defaults (CSRF, CSP nonce, API no-store headers, rate limiting)

This README reflects the app as it exists today and assumes a brand-new setup from scratch.

## What You Get

- Marketing + auth pages: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`
- Protected app area: `/dashboard`
  - Subpages: `/dashboard/billing`, `/dashboard/team`, `/dashboard/settings`, `/dashboard/usage`
- Team invite acceptance page: `/invite/[token]`
- Legal pages: `/privacy-policy`, `/terms-of-use`
- Core APIs for auth, team management, Stripe billing, AI chat, support email, and cron maintenance
- Full endpoint inventory is listed in `API Surface (Full Inventory)` below

## Stack

- Next.js 16 (App Router) + TypeScript + React 19
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- Stripe (`stripe`, `@stripe/stripe-js`)
- OpenAI (`openai`)
- Resend (`resend`)
- Tailwind CSS 4
- Vitest + Playwright + ESLint

## Quick Start (Fresh Project)

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Create a new Supabase project and apply schema:
   - Open Supabase SQL Editor
   - Run `supabase/schema.sql` in full
   - In Supabase Auth settings:
     - Site URL: `http://localhost:3000`
     - Redirect URL: `http://localhost:3000/auth/callback`
   - Optional social login (Google/Microsoft):
     - Enable provider(s) in Supabase Auth > Providers
     - Add provider credentials in Supabase
     - Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` and/or `NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED=true`

4. Create Stripe products/prices (monthly recurring):
   - Starter
   - Growth
   - Pro
   - Put their `price_...` IDs in `.env.local`

5. Configure Resend:
   - Create API key
   - Set a valid sender (`RESEND_FROM_EMAIL`)
   - Set support inbox (`RESEND_SUPPORT_EMAIL`)

6. Start Stripe webhook forwarding (for local billing flow):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the emitted `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

7. Start dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Copy from `.env.example` and set all required values.

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

- `OPENAI_API_KEY` (required only to enable `/api/ai/chat`)
- `AI_ALLOWED_SUBSCRIPTION_STATUSES` (CSV; if omitted, AI access remains disabled)
- `AI_PLAN_MODEL_MAP_JSON` (JSON object: plan key -> model or `null`; all `null` disables AI)
- `AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON` (JSON object: plan key -> monthly token budget)
- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` (set to `true` to show Google OAuth on `/login` and `/signup`)
- `NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED` (set to `true` to show Microsoft OAuth on `/login` and `/signup`)
- `CRON_SECRET`
- `NEXT_PUBLIC_INTERCOM_APP_ID`
- `INTERCOM_IDENTITY_SECRET`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`
- `SENTRY_ENVIRONMENT`
- `STRIPE_SEAT_PRORATION_BEHAVIOR` (`create_prorations` or `none`)
- `TEAM_MAX_MEMBERS` (default `100`; max active + pending invited members per team)
- `TRUST_PROXY_HEADERS`
- `TRUSTED_PROXY_HEADER_NAMES`

## Database Model (Supabase)

Apply `supabase/schema.sql` once for a fresh environment.

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

Important RPCs used by app code:

- `check_rate_limit(...)`
- `sync_stripe_subscription_atomic(...)`
- `accept_team_invite_atomic(...)`
- `transfer_team_ownership_atomic(...)`
- `recover_personal_team_if_missing(...)`
- `claim_ai_token_budget(...)`
- `finalize_ai_token_budget_claim(...)`
- `enqueue_ai_budget_finalize_retry(...)`

## Team + Auth Model (Core Flows)

- New users get a personal team automatically via `handle_new_user` trigger.
- Roles: `owner`, `admin`, `member`.
- Active team context is `profiles.active_team_id`.
- Team invites:
  - Create: `POST /api/team/invites` (owner/admin)
  - Accept: `/invite/[token]` UI + `POST /api/team/invites/accept`
  - Resend: `POST /api/team/invites/[inviteId]/resend` (owner/admin)
  - Revoke: `DELETE /api/team/invites/[inviteId]` (owner/admin)
- Team settings:
  - Update organization name: `PATCH /api/team/settings` (owner/admin)
- Team ownership:
  - Transfer ownership: `POST /api/team/ownership/transfer` (owner only)
- Users can recover a personal team: `POST /api/team/recover-personal`.
- Auth routes (core):
  - `POST /api/auth/signup`
  - `POST /api/auth/login`
  - `POST /api/auth/forgot-password`
  - `POST /reset-password/submit`
  - `GET /auth/callback`

## Billing (Stripe)

Plans:

- Starter/Growth/Pro display pricing is read from Stripe using:
  - `STRIPE_STARTER_PRICE_ID`
  - `STRIPE_GROWTH_PRICE_ID`
  - `STRIPE_PRO_PRICE_ID`
- This keeps landing-page prices aligned with checkout billing amounts.

Billing endpoints:

- `POST /api/stripe/checkout`
- `POST /api/stripe/portal`
- `POST /api/stripe/change-plan`
- `POST /api/stripe/webhook`

Behavior:

- Billing is team-scoped, not user-scoped.
- Seat quantity is reconciled to team membership count.
- Webhook handling uses dedupe/claim-token logic.
- Seat sync retries persist in `seat_sync_retries`.
- Subscription metadata sync healing reuses seat reconciliation workers.

## OpenAI Chat Endpoint

Endpoints:

- `POST /api/ai/chat`

Current behavior:

- Authenticated users only, with CSRF + JSON content-type checks.
- Request schema:
  - `messages`: 1-30 items
  - each `content`: 1-8000 chars
  - `role`: only `"user"` or `"assistant"` (no `"system"` accepted)
- Plan + status gating are fully configurable via environment:
  - `AI_ALLOWED_SUBSCRIPTION_STATUSES`
  - `AI_PLAN_MODEL_MAP_JSON`
- Model selection is configurable per plan via `AI_PLAN_MODEL_MAP_JSON`
- Completion cap: `max_tokens: 4096`
- Rate limits:
  - Per user: `RATE_LIMITS.aiChatByUser`
  - Per team: `RATE_LIMITS.aiChatByTeam`
- Team monthly budgets are configurable per plan via `AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON`
- User-facing AI unavailability responses are intentionally generic and do not reveal plan/model/config details
- Budget enforcement is atomic:
  - reserve with `claim_ai_token_budget(...)`
  - reconcile with `finalize_ai_token_budget_claim(...)`
- Usage and audit:
  - token usage written to `ai_usage`
  - audit events written to `audit_events`
- Response type: streaming plain text (`text/plain; charset=utf-8`)

## Support Email Endpoint

Endpoint: `POST /api/resend/support`

- Auth + CSRF protected
- Payload:
  - `subject`: optional, max 120 chars
  - `message`: required, 10-2000 chars
- Sends to `RESEND_SUPPORT_EMAIL` from `RESEND_FROM_EMAIL`
- Rate limited by user and client identity

## Cron Endpoints

Both require `Authorization: Bearer <CRON_SECRET>`.

- `GET /api/cron/reconcile-seat-quantities`
  - Reconciles Stripe subscription quantity with team seats
  - Drains queued AI budget-claim finalization retries
  - Returns `500` (with a detailed body) if any internal cron job fails
- `GET /api/cron/prune-stripe-webhook-events`
  - Prunes old webhook event rows

If `CRON_SECRET` is missing, these endpoints return `503`.

## Security Defaults

- CSRF token cookie + header validation on write endpoints
- Rate limiting via distributed DB window + in-memory fallback circuit breaker
- `proxy.ts` sets:
  - CSP header with nonce (production)
  - CSRF cookie bootstrap
  - Supabase session refresh
- `next.config.ts` sets:
  - HSTS, XFO, Referrer-Policy, Permissions-Policy, nosniff
  - `Cache-Control: no-store` for `/api/*`

## Optional Sentry Monitoring

This starter includes minimal Sentry wiring for App Router server, client, and edge runtimes, but it is fully opt-in.

What is captured:

- Unhandled App Router request errors (`instrumentation.ts` request hook)
- Errors surfaced by app-level boundaries (`app/global-error.tsx`, `app/dashboard/error.tsx`)
- `logger.error(...)` calls (keeps existing console/structured logging behavior)

How to enable:

1. Set `NEXT_PUBLIC_SENTRY_DSN` in your environment.
2. Optionally set `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (for example: `development`, `staging`, `production`).
3. Optionally set `SENTRY_ENVIRONMENT` only if you need a different server/edge value than client.
4. Redeploy/restart the app.

How to disable:

- Remove `NEXT_PUBLIC_SENTRY_DSN` (or leave it empty) and restart/redeploy.
- With no DSN configured, Sentry initialization is disabled and capture calls become a no-op.

Local dev behavior:

- If `NEXT_PUBLIC_SENTRY_DSN` is not set locally, only normal console logs/errors are emitted.
- If it is set, local errors can be sent to your Sentry project.

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - run built app
- `npm run lint` - run ESLint
- `npm run typecheck` - run TypeScript type-checking
- `npm run test` - run Vitest once
- `npm run test:watch` - run Vitest in watch mode
- `npm run test:e2e:smoke` - run Playwright smoke tests (`@smoke`)
- `npm run test:e2e` - run full Playwright suite
- `npm run test:e2e:ui` - run Playwright UI mode

## Playwright E2E

Lean smoke coverage is in `e2e/` and focuses on:

- auth redirect for protected routes
- dashboard render for seeded owner user
- sidebar active navigation state
- invite acceptance flow (fixture-backed API response)
- billing permissions for seeded member role

Seeded test users/tokens are provided with environment variables:

- `E2E_OWNER_EMAIL`
- `E2E_OWNER_PASSWORD`
- `E2E_MEMBER_EMAIL`
- `E2E_MEMBER_PASSWORD`
- `E2E_INVITE_TOKEN` (optional; defaults to a fixture token)

In CI, Playwright smoke tests run only when required seeded auth variables and
`PLAYWRIGHT_BASE_URL` are configured; otherwise the workflow skips Playwright
and still runs Vitest.

CI setup:

- PR workflow runs Vitest + Playwright smoke tests on every pull request

## API Surface (Full Inventory)

- Auth: `/auth/callback`, `/api/auth/login`, `/api/auth/signup`, `/api/auth/forgot-password`, `/reset-password/submit`
- Team: `/api/team/invites`, `/api/team/invites/accept`, `/api/team/invites/[inviteId]`, `/api/team/invites/[inviteId]/resend`, `/api/team/members/[userId]`, `/api/team/settings`, `/api/team/ownership/transfer`, `/api/team/recover-personal`
- Stripe: `/api/stripe/checkout`, `/api/stripe/portal`, `/api/stripe/change-plan`, `/api/stripe/webhook`
- AI: `/api/ai/chat`
- Support: `/api/resend/support`
- Cron: `/api/cron/reconcile-seat-quantities`, `/api/cron/prune-stripe-webhook-events`
- Intercom boot: `/api/intercom/boot`

## Deploy (Vercel)

1. Push repo and import into Vercel
2. Set all required environment variables (and `OPENAI_API_KEY` only if enabling AI chat)
3. In Supabase Auth, set production Site URL + callback URL
4. Create Stripe webhook to `/api/stripe/webhook` and set `STRIPE_WEBHOOK_SECRET`
5. Optionally configure scheduled requests for both cron endpoints with `CRON_SECRET`
6. Deploy

## Launch Checklist

- `supabase/schema.sql` applied in production project
- All env vars set correctly (including Stripe price IDs)
- Stripe webhook receives and verifies events
- Resend sender verified
- Optional Intercom keys configured if used
- `TRUST_PROXY_HEADERS` enabled only behind trusted proxy infrastructure

## Notes for Customization

- Update branding/copy in landing and auth pages
- Update legal content in `app/privacy-policy/page.tsx` and `app/terms-of-use/page.tsx`
- Adjust pricing in Stripe and keep `STRIPE_*_PRICE_ID` env values updated
