# Architecture

How the pieces of this codebase fit together.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with React 19
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS 4
- **Database & Auth**: Supabase (Postgres + Auth + RLS)
- **Billing**: Stripe (subscriptions, seat-based pricing)
- **AI**: Vercel AI SDK (provider-agnostic: OpenAI, Anthropic, Google)
- **Email**: Resend
- **Background Jobs**: Trigger.dev v4
- **Caching**: Upstash Redis (optional)
- **Error Monitoring**: Sentry (optional)
- **In-app Messaging**: Intercom (optional)
- **i18n**: next-intl (8 locales: en, es, pt, fr, de, zh, ja, ko)

## Directory Map

```
app/                          # Next.js App Router
  api/                        # API routes (organized by domain)
    auth/                     # signup, login, forgot-password
    team/                     # invites, members, settings, ownership
    onboarding/               # complete (mark onboarding done for free plan)
    stripe/                   # checkout, change-plan, portal, webhook
    ai/                       # chat (streaming), object (structured output), threads (persisted chat)
      threads/                # CRUD for ai_threads + messages
    cron/                     # reconcile-seat-quantities, prune-webhook-events
    resend/                   # support email
    intercom/                 # identity boot
  auth/                       # OAuth callback route
  onboarding/                 # Post-signup plan selection (paywall gate)
  dashboard/                  # Protected dashboard pages
    actions.ts                # Server actions (logout, update settings, delete account, etc.)

components/                   # React components (flat structure)
  ai/                         # Composable AI UI (conversation, message-bubble, prompt-input, etc.)
  landing/                    # Landing page components (grouped subdirectory)
  onboarding/                 # Onboarding plan selector with monthly/annual toggle

lib/                          # Shared business logic (organized by domain)
  ai/                         # AI access control, budgets, provider abstraction, token estimation
    schemas/                  # Structured output schema registry (used by /api/ai/object)
    tools/                    # Agent tool registry (opt-in via AI_TOOLS_ENABLED)
    threads.ts                # Thread persistence data access layer
    stream-store.ts           # Redis-backed resumable stream storage
  auth/                       # Social auth provider detection
  billing/                    # Plan capabilities, entitlements, effective plan resolution
  constants/                  # Durations, rate limits, billing timing
  dashboard/                  # Server-side data fetching for dashboard pages
  http/                       # Request validation, CSRF client, content-type, team route helper
  i18n/                       # Locale resolution, route translators
  intercom/                   # HMAC signature for identity verification
  redis/                      # Upstash Redis client singleton
  resend/                     # Email client and sending
  security/                   # CSRF verification, rate limiting
  stripe/                     # Plans, config, seats, sync, webhooks, reconciliation, retries
  supabase/                   # Client (browser), server, admin, middleware, types
  team/                       # Team member limits
  trigger/                    # Trigger.dev client, dispatch, job definitions

e2e/                          # Playwright end-to-end tests
i18n/                         # next-intl routing and request config
messages/                     # Translation JSON files (en, es, pt, fr, de, zh, ja, ko)
supabase/                     # Database migrations and seed data
```

## Request Lifecycle

### API Routes

A typical API request flows through these layers:

```
Incoming Request
  |
  v
Next.js App Router (matches app/api/.../route.ts)
  |
  v
Route Handler (POST/GET/PATCH/DELETE function)
  |
  +-- 1. CSRF verification (lib/security/csrf.ts)
  |     Checks Origin header + double-submit cookie token
  |
  +-- 2. Content-Type validation (lib/http/content-type.ts)
  |     Requires application/json for routes with a body
  |
  +-- 3. Authentication (lib/supabase/server.ts)
  |     Creates a Supabase server client, calls getUser()
  |
  +-- 4. Team context resolution (lib/team-context-cache.ts)
  |     Redis -> in-memory cache -> database lookup
  |     Returns { teamId, teamName, role } or null
  |
  +-- 5. Role authorization
  |     Checks if user's role is in allowedRoles
  |
  +-- 6. Rate limiting (lib/security/rate-limit.ts)
  |     Redis -> Supabase RPC -> in-memory fallback
  |     Returns 429 with Retry-After header if blocked
  |
  +-- 7. Body parsing + Zod validation (lib/http/request-validation.ts)
  |     Reads body with size limit (256KB default), validates schema
  |
  +-- 8. Business logic
  |     Database operations, external API calls
  |
  +-- 9. Audit logging (lib/audit.ts)
  |     Batched inserts to audit_events table
  |
  v
Response
```

For team-scoped routes, `withTeamRoute()` in `lib/http/team-route.ts` typically handles steps 1-8 (including body parsing when a schema is provided). Standalone routes (auth, cron, and some Stripe routes) call the same primitives explicitly and may parse request bodies earlier when needed.

### Server Actions

Server actions (`app/dashboard/actions.ts`) follow a similar pattern but use `verifyCsrfProtectionForServerAction()` instead of `verifyCsrfProtection()`, and return `{ status, message }` state objects instead of HTTP responses.

### Pages

Public auth pages live at top-level routes (`app/login/`, `app/signup/`, `app/forgot-password/`, `app/reset-password/`). Dashboard pages load data server-side via cached functions in `lib/dashboard/server.ts`:

```
Dashboard Page (app/dashboard/page.tsx)
  |
  +-- getDashboardUser(supabase)          # User profile
  +-- getDashboardTeamOptions(supabase)   # Teams the user belongs to
  +-- getDashboardTeamMembers(...)        # Members of the active team
  +-- getDashboardTeamBilling(...)        # Subscription + customer data
  +-- getDashboardTeamAiAccess(...)       # AI access resolution for UI gating
  +-- getDashboardTeamFeatures(...)       # Feature entitlements
```

## Domain Dependencies

Each `lib/` subdirectory has clear dependencies. Arrows mean "depends on."

```
lib/ai/ ---------> lib/billing/     (resolves plan -> AI access)
                -> lib/stripe/plans  (subscription status types)
                -> lib/supabase/     (budget claims via RPC)

lib/billing/ ----> lib/stripe/plans  (plan keys, price IDs)
                -> lib/env           (feature flags)

lib/stripe/ -----> lib/supabase/     (data persistence)
                -> lib/billing/      (isBillingEnabled check)
                -> lib/trigger/      (async job dispatch)

lib/http/ -------> lib/security/     (CSRF, rate limiting)
                -> lib/supabase/     (auth)
                -> lib/team-context  (team resolution)

lib/security/ ---> lib/redis/        (distributed rate limiting)
                -> lib/supabase/     (RPC fallback for rate limiting)

lib/trigger/ ----> lib/stripe/       (webhook processing, seat reconciliation)
                -> lib/resend/       (email sending)
                -> lib/ai/           (budget finalize retries)
```

Key rule: `lib/billing/` reads from Stripe sync data but never calls the Stripe API directly. `lib/stripe/` owns all Stripe API calls.

## Core Abstractions

### `env` (lib/env.ts)

Type-safe environment variable access via lazy property getters. Application and business code must use `env.MY_KEY`; direct `process.env` reads are restricted to an explicit infrastructure allowlist (see CONVENTIONS.md "Environment Variables > `process.env` allowlist"). Required env getters throw on access if missing; optional getters return `undefined`.

In production Node runtime, `validateRequiredEnvAtBoot()` forces critical getters to fire, failing fast on misconfiguration.

### `withTeamRoute` (lib/http/team-route.ts)

A middleware wrapper that handles the full validation chain for team-scoped API routes: CSRF, content-type, auth, team context, role checks, rate limiting, and body parsing. Your route handler receives a pre-validated context object with `user`, `teamContext`, `body`, and `requestId`.

### `withAuthedRoute` (lib/http/authed-route.ts)

A middleware wrapper for routes that require authentication but not team membership (e.g., invite acceptance, personal team recovery, support email). Handles CSRF, content-type, auth, rate limiting, and optional body parsing. Your handler receives `request`, `requestId`, `supabase`, `user`, and `body`. Use `withTeamRoute` when team context is required; use `withAuthedRoute` when only a logged-in user is needed.

### `checkRateLimit` (lib/security/rate-limit.ts)

Multi-backend rate limiter with automatic fallback: tries Redis first (atomic Lua script), falls back to Supabase RPC, then to an in-memory store. Includes a circuit breaker that switches to in-memory after 3 consecutive distributed failures.

### `getCachedTeamContextForUser` (lib/team-context-cache.ts)

Multi-tier cache for resolving a user's active team and role: Redis (shared across instances, 30s TTL) -> in-memory Map (per-instance, 30s TTL) -> database query. Invalidated explicitly after any team membership change.

### `logger` (lib/logger.ts)

Structured JSON logging in production, pretty console output in development. All output is automatically redacted for sensitive values (API keys, tokens, passwords). Errors are forwarded to Sentry with sanitized context.

### `logAuditEvent` (lib/audit.ts)

Batched audit event persistence. Events are queued in memory, flushed in batches of 25 (or every 200ms), with exponential backoff retry on failure. The queue defaults to a 1,000-event cap (configurable via env) to prevent unbounded memory growth.

### AI Provider Abstraction (lib/ai/provider.ts)

A single `getAiLanguageModel(model)` function that returns a Vercel AI SDK model instance regardless of which provider (OpenAI, Anthropic, Google) is configured. The provider is selected once at module load time based on `AI_PROVIDER` env var.

## Data Flow: Key Features

### Signup -> Onboarding -> Team Creation

```
1. POST /api/auth/signup
   - Validate email + password
   - Rate limit by client IP and email
   - Call Supabase signUp() (creates auth.users row)
   - Supabase trigger creates profile + personal team + owner membership
   - Return { ok: true, sessionCreated: bool }

2. Client redirects to /onboarding (plan selection page)
   - If APP_FREE_PLAN_ENABLED=true: shows Free + paid plans (4-column grid)
   - If APP_FREE_PLAN_ENABLED=false: shows paid plans only (3-column grid)
   - Monthly/annual toggle shown when annual Stripe price IDs are configured
   - Free plan: POST /api/onboarding/complete -> sets onboarding_completed_at -> /dashboard
   - Paid plan: POST /api/stripe/checkout (source=onboarding) -> Stripe -> /onboarding?checkout=success -> /dashboard

3. Dashboard layout paywall gate
   - If billing enabled and effectivePlanKey === null -> redirect to /onboarding
   - If billing enabled and effectivePlanKey === "free" and onboarding_completed_at is null -> redirect to /onboarding
```

### Stripe Checkout -> Subscription

```
1. POST /api/stripe/checkout
   - Accepts planKey, interval (month/year), and optional source (e.g. "onboarding")
   - Verify team has no live subscription
   - Create or reuse Stripe customer (with supabase_team_id metadata)
   - Resolve price ID from planKey + interval (monthly or annual)
   - Create Stripe Checkout Session (success/cancel URLs vary by source)
   - Return { url: checkoutUrl }

2. User completes payment on Stripe

3. POST /api/stripe/webhook (checkout.session.completed)
   - Verify signature
   - Try Trigger.dev async, else process inline
   - Claim webhook event (idempotent)
   - Upsert Stripe customer mapping
   - Sync subscription to local DB

4. POST /api/stripe/webhook (customer.subscription.created)
   - Sync subscription again (belt-and-suspenders)
```

### AI Chat Request

```
1. POST /api/ai/chat
   - CSRF + auth + team context + rate limit (per-user and per-team)
   - Resolve effective plan from subscription
   - Check AI access policy (plan enabled? model assigned? modalities allowed?)
   - Estimate prompt tokens, project total with 4,096 completion max
   - Atomically claim budget from team's monthly token budget (RPC)
   - If tools disabled (default): plain text stream via streamText()
   - If tool-calling is enabled and at least one tool integration is configured:
     - streamText() with tools from AI_TOOL_MAP, stopWhen: stepCountIs(maxSteps)
     - Agent loop runs server-side; onStepFinish accumulates usage and aborts on budget
     - Response via toUIMessageStreamResponse() (UI message stream protocol)
   - On stream finish: finalize budget claim with actual token usage
   - On finalize failure: enqueue retry to ai_budget_claim_finalize_retries
```

### AI Structured Output Request

```
1. POST /api/ai/object
   - Shared pre-flight via resolveAiRequestContext():
     CSRF + auth + team context + rate limit + body parse + plan/access/budget
   - Look up schema by name from AI_SCHEMA_MAP (lib/ai/schemas/)
   - streamObject() with Zod schema + prompt
   - On stream finish: finalize budget claim with actual token usage
   - On finalize failure: enqueue retry to ai_budget_claim_finalize_retries
```

### AI Thread Persistence

```
Chat messages are automatically persisted to threads (ai_threads + ai_thread_messages).
Threads are user-private within a team: AI access and token budgets are team-scoped,
but thread history is scoped to the authenticated user and enforced in both route code
and database RLS policies.

1. POST /api/ai/chat (with or without threadId)
   - If threadId provided: validate ownership (team_id + user_id), return 404 if invalid
   - If threadId absent: auto-create a new thread on stream finish (title = first 100 chars of last user message)
   - On stream finish (both agent and single-turn paths):
     save last user message + assistant response to ai_thread_messages with metadata (model, tokens, duration)

2. Thread CRUD: /api/ai/threads
   - GET  /api/ai/threads                       — list threads (team + user scoped)
   - POST /api/ai/threads                       — create thread
   - GET  /api/ai/threads/[threadId]             — get thread (ownership check)
   - PATCH /api/ai/threads/[threadId]            — rename thread
   - DELETE /api/ai/threads/[threadId]           — delete thread (cascades to messages)
   - GET  /api/ai/threads/[threadId]/messages    — load thread messages

All thread routes use withTeamRoute (not resolveAiRequestContext) since they don't
involve AI model calls or budget management.
```

Both `/api/ai/chat` and `/api/ai/object` share the same pre-flight pipeline via `resolveAiRequestContext()` in `lib/ai/request-context.ts`, which handles CSRF, auth, team context, rate limiting, body parsing, subscription/plan resolution, AI access checks, modality validation, and budget claiming.

### Seat Sync After Membership Change

```
1. Team member added/removed (invite accept, member removal, etc.)
   - Invalidate team context cache for affected users
   - Call syncTeamSeatQuantity(teamId)
     - Count current team members in DB
     - Compare with Stripe subscription quantity
     - If different: update Stripe subscription with new quantity
     - Double-check count after update (handles race conditions)
   - On failure: enqueue to seat_sync_retries with exponential backoff

2. Cron: GET /api/cron/reconcile-seat-quantities (periodic)
   - Load all teams with live subscriptions
   - Load due retry entries
   - Optionally discover teams from Stripe customer list
   - Sync each team's seat count with concurrency limit (10)
   - Clear retries on success, re-enqueue on failure
```

## Feature Flags

Most features are toggled via environment variables, not code flags:

| Feature               | Enabled when                                                       | Controlled by                                                                                        |
| --------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Stripe billing        | `BILLING_PROVIDER=stripe` + Stripe env vars set                    | `isBillingEnabled()` in `lib/billing/capabilities.ts`                                                |
| Free plan             | `APP_FREE_PLAN_ENABLED=true` (default)                             | `isFreePlanEnabled()` in `lib/billing/capabilities.ts`                                               |
| AI chat + object      | AI provider env var set (e.g., `OPENAI_API_KEY`)                   | `isAiProviderConfigured` in `lib/ai/provider.ts`                                                     |
| AI access mode        | `AI_ACCESS_MODE` = `paid` / `all` / `by_plan`                      | `getAiAccessMode()` in `lib/ai/config.ts`                                                            |
| AI agent tools        | `AI_TOOLS_ENABLED=true` + at least one tool integration configured | `getAiToolsEnabled()` in `lib/ai/config.ts` + `hasAnyAiToolsConfigured()` in `lib/ai/tools/index.ts` |
| Email (Resend)        | `RESEND_API_KEY` + `RESEND_FROM_EMAIL` set                         | `isResendCustomEmailConfigured()` in `lib/resend/server.ts`                                          |
| Background jobs       | `TRIGGER_SECRET_KEY` set                                           | `isTriggerConfigured()` in `lib/trigger/config.ts`                                                   |
| Redis caching         | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set          | `getRedisClient()` returns non-null in `lib/redis/client.ts`                                         |
| Intercom              | `NEXT_PUBLIC_INTERCOM_APP_ID` set                                  | Checked in dashboard layout                                                                          |
| Sentry                | `NEXT_PUBLIC_SENTRY_DSN` set                                       | `SENTRY_ENABLED` in `lib/logger.ts`                                                                  |
| AI tool: Tavily       | `TAVILY_API_KEY` set                                               | Conditional registration in `lib/ai/tools/index.ts`                                                  |
| AI tool: Firecrawl    | `FIRECRAWL_API_KEY` set                                            | Conditional registration in `lib/ai/tools/index.ts`                                                  |
| AI tool: Composio     | `COMPOSIO_API_KEY` set                                             | Conditional registration in `lib/ai/tools/index.ts`                                                  |
| AI tool: E2B          | `E2B_API_KEY` set                                                  | Conditional registration in `lib/ai/tools/index.ts`                                                  |
| Resumable streams     | `AI_RESUMABLE_STREAMS_ENABLED=true` + Redis configured             | `isResumableStreamsEnabled()` in `lib/ai/stream-store.ts`                                            |
| Social auth providers | `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`, etc.                       | `getEnabledSocialAuthProviders()` in `lib/auth/social-auth.ts`                                       |

Core integrations degrade gracefully when dependencies are missing. For example, if Trigger.dev isn't configured, webhook processing falls back to inline execution. If Redis isn't configured, rate limiting falls back to Supabase RPC, then to in-memory.
