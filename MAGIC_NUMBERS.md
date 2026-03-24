# Magic Numbers

Key hardcoded constants in this codebase, what they control, and why they were chosen.

## Rate Limiting

### Per-Endpoint Limits

Defined in `lib/constants/rate-limits.ts`. All values use `MINUTE_MS` (60,000) and `HOUR_MS` (3,600,000) from `lib/constants/durations.ts`.

| Constant | Limit | Window | Why |
|----------|-------|--------|-----|
| `authSignupByClient` | 10 | 10 min | Blocks credential-stuffing bots while allowing a real user several retries for typos. |
| `authSignupByEmail` | 3 | 1 hour | Much stricter per-email than per-client. Prevents a single email from being hammered. One hour window because legitimate signups don't retry more than a few times. |
| `authLoginByClient` | 20 | 10 min | Higher than signup because users mistype passwords more often than emails. |
| `authLoginByEmail` | 10 | 10 min | Per-email limit prevents brute-force on a single account. |
| `forgotPasswordByClient` | 10 | 10 min | Liberal per-client since the response is always generic (no information leakage). |
| `forgotPasswordByEmail` | 3 | 10 min | Prevents flooding a user's inbox with reset emails. |
| `resetPasswordSubmitByClient` | 15 | 10 min | Allows legitimate retries on reset form submission errors. |
| `authCallbackByClient` | 10 | 1 min | Short window to prevent OAuth callback replay attacks. |
| `teamInviteCreateByTeam` | 20 | 1 hour | A team won't legitimately send more than 20 invites in an hour. Per-team (not per-user) so multiple admins share the budget. |
| `teamInviteAcceptByUser` | 20 | 10 min | A user shouldn't be accepting invites this fast. Mostly defends against automated abuse. |
| `teamInviteAcceptByClient` | 40 | 10 min | Higher per-client than per-user because multiple users may share a client IP (office network). |
| `teamMemberRemoveByActor` | 30 | 10 min | High enough for bulk cleanup, low enough to prevent accidental mass-removal scripts. |
| `teamMemberRoleUpdateByActor` | 40 | 10 min | Generous for legitimate admin operations. |
| `teamInviteRevokeByActor` | 40 | 10 min | Same reasoning as role updates. |
| `teamInviteResendByActor` | 40 | 10 min | Same reasoning as role updates. |
| `teamOwnershipTransferByActor` | 10 | 10 min | Ownership transfer is rare and high-impact. Lower limit adds a speed bump. |
| `teamSettingsUpdateByActor` | 20 | 10 min | Prevents rapid-fire team name changes. |
| `dashboardSettingsUpdateByUser` | 20 | 10 min | Same reasoning as team settings. |
| `aiChatByUser` | 30 | 10 min | Roughly 3 messages/minute. Prevents a single user from monopolizing AI resources. |
| `aiChatByTeam` | 120 | 10 min | 4x the per-user limit so a 4-person team can all use AI concurrently. |
| `stripeCheckoutByTeam` | 10 | 1 min | Checkout is expensive (creates Stripe sessions). Short window prevents runaway retry loops. |
| `stripeChangePlanByTeam` | 10 | 1 min | Plan changes mutate subscriptions. Same reasoning as checkout. |
| `stripePortalByTeam` | 20 | 1 min | Portal sessions are cheaper to create than checkouts, so slightly more generous. |
| `supportByUser` | 5 | 10 min | Prevents a user from flooding the support inbox. |
| `supportByClient` | 20 | 10 min | Higher per-client to allow shared networks. |
| `teamRecoveryByUser` | 10 | 10 min | Recovery is a safety valve, not a normal operation. |
| `cronByClientIp` | 30 | 1 min | Cron endpoints should see low request volume. 30/min leaves room for retries/concurrency while limiting abuse. |

### Rate Limit Infrastructure

Defined in `lib/security/rate-limit.ts`.

| Constant | Value | Why |
|----------|-------|-----|
| `PRODUCTION_FAIL_OPEN_WINDOW_MS` | 5,000 (5 sec) | When both Redis and Supabase rate limiting fail, allow all traffic for 5 seconds before switching to the in-memory fallback. This prevents a brief DB blip from triggering the circuit breaker. |
| `PRODUCTION_CIRCUIT_BREAKER_FAILURE_THRESHOLD` | 3 | After 3 consecutive failures (outside the fail-open window), open the circuit breaker. Chosen to tolerate transient errors while catching sustained outages. |
| `PRODUCTION_CIRCUIT_BREAKER_COOLDOWN_MS` | 30,000 (30 sec) | When the circuit breaker opens, use the in-memory fallback for 30 seconds before retrying the distributed store. Long enough to survive most transient outages. |
| `FALLBACK_SWEEP_INTERVAL_MS` | 30,000 (30 sec) | Interval for cleaning expired entries from the in-memory rate limit store. Balances memory usage against sweep overhead. |
| `FALLBACK_MAX_ENTRIES` | 10,000 | Maximum entries in the in-memory fallback map. When exceeded, oldest entries are evicted. 10k entries covers ~10k unique rate limit keys, which is generous for a single instance. |

### Rate Limit Fallback Chain

The rate limiter tries backends in order: Redis -> Supabase RPC -> in-memory. This is defined in `checkRateLimit()` in `lib/security/rate-limit.ts`. The chain exists so the app can run with or without Redis, and degrades gracefully if Supabase is temporarily unavailable.

## CSRF Protection

Defined in `lib/security/csrf.ts`.

| Constant | Value | Why |
|----------|-------|-----|
| `CSRF_COOKIE_MAX_AGE_SECONDS` | 1,209,600 (14 days) | Matches a typical session length. Longer than most session cookies so the CSRF token outlives the session rather than expiring mid-session. |
| `TOKEN_RE` | `/^[A-Za-z0-9_-]{20,200}$/` | Tokens are 24 random bytes base64url-encoded (32 chars). The regex allows 20-200 to accept both current and future token lengths. Restricted to base64url characters only. |
| Token size: 24 bytes | `randomBytes(24)` | 192 bits of entropy. Well above the OWASP recommendation of 128 bits for CSRF tokens. |

## Authentication

### Auth Callback (`app/auth/callback/route.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| Callback client cookie max age | 2,592,000 sec (30 days) | Tracks the client for rate limiting OAuth callbacks. Long-lived so the same browser doesn't generate new tracking UUIDs on every login. |
| Password recovery cookie max age | 600 sec (10 min) | Short-lived because the password reset flow should complete quickly. Limits the window where the recovery cookie is valid. |
| Last auth provider cookie max age | 15,552,000 sec (180 days) | Used to hint which social provider the user last signed in with. Long-lived for UX convenience. |

### Password Validation (`lib/validation.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| Minimum password length | 12 | NIST SP 800-63B recommends a minimum of 8. 12 provides additional margin and is standard for SaaS apps. |
| Maximum password length | 128 | Prevents denial-of-service via extremely long passwords that are expensive to hash. 128 is more than enough for any passphrase. |
| Email local part max | 64 | RFC 5321 limit. |
| Email domain label max | 63 | RFC 1035 limit. |
| Email total max | 320 | RFC 5321 theoretical max (64 + 1 + 255). |

## Team Invites

Defined in `lib/team-invites.ts`.

| Constant | Value | Why |
|----------|-------|-----|
| `TEAM_INVITE_TTL_DAYS` | 7 | One week gives invitees time to see the email and act. Longer than 7 days risks the invite being forgotten; shorter risks legitimate invitees missing it. |
| Invite token size | 24 bytes (`randomBytes(24)`) | Same entropy as CSRF tokens (192 bits). Tokens are hashed with SHA-256 before storage so the raw token is never persisted. |
| Token schema: min 10, max 256 | Accept route validation | The raw base64url token is 32 chars. The 10-256 range gives headroom for format changes without breaking existing tokens. |

## Team Limits

Defined in `lib/team/limits.ts`.

| Constant | Value | Why |
|----------|-------|-----|
| `DEFAULT_TEAM_MAX_MEMBERS` | 100 | Configurable via `TEAM_MAX_MEMBERS` env var. 100 is a reasonable default for a SaaS starter -- large enough for most teams, small enough to prevent abuse. The limit includes both active members and pending invites. |

## Billing & Stripe

### Billing Timing (`lib/constants/billing.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| `CHECKOUT_IN_FLIGHT_WINDOW_MS` | 60,000 (1 min) | Prevents duplicate checkout sessions if a user double-clicks the subscribe button. One minute is long enough to cover slow network round-trips but short enough that a genuinely failed attempt can be retried. |
| `CLIENT_IDEMPOTENCY_TTL_MS` | 600,000 (10 min) | Idempotency key lifetime for client-provided keys. 10 minutes covers the entire checkout flow including Stripe redirect and return. |
| `SYNC_PENDING_RELOAD_DELAY_MS` | 4,000 (4 sec) | After a billing change, wait 4 seconds before reloading the UI. Gives the Stripe webhook time to arrive and update the local database. |

### Stripe Webhook Processing (`lib/stripe/webhook-constants.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| `WEBHOOK_EVENT_RETENTION_DAYS` | 30 | Old webhook event records are pruned after 30 days. Matches Stripe's own event retention. Keeps the table small while allowing replay debugging. |
| `WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` | 300 (5 min) | Maximum clock skew between Stripe's servers and ours for signature verification. Stripe's SDK default is 300 seconds. |
| `WEBHOOK_CLAIM_TTL_SECONDS` | 300 (5 min) | When a worker claims a webhook event for processing, the claim expires after 5 minutes. Prevents a dead worker from locking an event forever. |
| `WEBHOOK_PRUNE_SAMPLE_RATE` | 0.05 (5%) | Probabilistic pruning: only 5% of webhook requests trigger a prune check. Spreads the cleanup cost across requests instead of running it on every webhook. |

### Webhook Heartbeat (`lib/stripe/webhook-processing.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| Heartbeat interval | `Math.max(1_000, Math.floor((WEBHOOK_CLAIM_TTL_SECONDS * 1000) / 2))` = ~150,000ms | The heartbeat extends the claim while processing is in progress. Running at half the TTL ensures the claim is extended well before it expires. The `1_000` floor prevents sub-second intervals if the TTL is very short. |

### Seat Sync Retries (`lib/stripe/seat-sync-retries.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| `BASE_RETRY_DELAY_MS` | 60,000 (1 min) | First retry waits 1 minute. Long enough for transient Stripe API issues to resolve. |
| `MAX_RETRY_DELAY_MS` | 3,600,000 (1 hour) | Exponential backoff caps at 1 hour. Prevents retries from spreading too far apart while avoiding hammering a failing API. |
| `MAX_ERROR_TEXT_LENGTH` | 1,000 | Truncates error messages stored in the retry queue. Prevents a single stack trace from bloating the database row. |

### Seat Reconciliation (`lib/stripe/seat-reconcile.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| `DEFAULT_SYNC_CONCURRENCY` | 10 | Process 10 teams in parallel during reconciliation. Balances speed against Stripe API rate limits. |
| `DEFAULT_STRIPE_DISCOVERY_CONCURRENCY` | 10 | Same concurrency for the Stripe customer discovery phase. |
| Default `batchSize` | 500 | How many subscription rows to load per DB query during reconciliation. 500 is well within Supabase's row limit per request. |
| Default `stripePageLimit` | 20 | Maximum Stripe API pages to scan during discovery (each page = 100 subscriptions). 20 pages = up to 2,000 subscriptions. |
| Default `retryBatchSize` | 500 | How many due retry records to load at once. Matches the DB batch size for consistency. |

### Stripe Plans (`lib/stripe/plans.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| `PLAN_KEYS` | `["starter", "growth", "pro"]` | The three tiers. These keys are used to look up `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, and `STRIPE_PRO_PRICE_ID` from environment variables. |
| `LIVE_SUBSCRIPTION_STATUSES` | `["incomplete", "trialing", "active", "past_due", "unpaid", "paused"]` | Statuses that represent a subscription that is still "in force" (not terminal). Excludes `incomplete_expired` and `canceled`. Used to determine whether a team has an active subscription. |
| `AI_ELIGIBLE_SUBSCRIPTION_STATUSES` | `["trialing", "active", "past_due"]` | Subset of live statuses eligible for paid AI features. Excludes `incomplete` (payment not started), `unpaid` (payment failed), and `paused` (explicitly frozen). Keeps AI access tied to genuine paying customers. |
| `planKey` max length | 100 chars | In `parsePlanKey()` in `lib/validation.ts`. Prevents excessively long plan keys from being used as lookup keys. |

### Seat Proration

Configured via `STRIPE_SEAT_PRORATION_BEHAVIOR` env var, defaults to `"create_prorations"`. This means adding/removing a team member mid-billing-cycle creates a prorated charge or credit. The alternative `"none"` skips proration entirely.

## AI Chat

### Request Limits (`app/api/ai/chat/route.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| `AI_COMPLETION_MAX_TOKENS` | 4,096 | Maximum tokens for a single AI response. Used to project token budget consumption before streaming starts. 4,096 is a conservative estimate that covers most conversational responses. |
| `MAX_ATTACHMENTS_PER_MESSAGE` | 8 | Maximum file/image attachments on a single user message. Prevents abuse while allowing rich context (e.g., multiple screenshots). |
| `MAX_ATTACHMENTS_PER_REQUEST` | 16 | Maximum total attachments across all messages in a request. A conversation of 30 messages could have up to 16 attachments spread across them. |
| Message `content` max length | 8,000 chars | Per-message content limit. Roughly 2,000 tokens. Prevents a single message from consuming the entire budget. |
| Max messages per request | 30 | Maximum messages in the conversation history sent to the AI. Prevents extremely long context windows that are expensive and slow. |
| Attachment `data` max length | 300,000 chars | Base64-encoded inline attachment limit (~225KB decoded). Large enough for screenshots, small enough to prevent request body abuse. |
| Attachment `name` max length | 255 chars | Standard filesystem path component limit. |
| Attachment `mimeType` max length | 255 chars | Generous for any valid MIME type. |

### Supported File Types

| Set | Types | Why |
|-----|-------|-----|
| `SUPPORTED_IMAGE_MIME_TYPES` | `image/png`, `image/jpeg`, `image/webp`, `image/gif` | The image formats this app currently accepts in its attachment validation pipeline. |
| `SUPPORTED_FILE_MIME_TYPES` | `application/pdf`, `text/plain`, `text/csv` | Document formats that can be meaningfully parsed by language models. |

### AI Budget Finalize Retries (`lib/ai/budget-finalize-retries.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| `DEFAULT_BACKGROUND_RETRY_DRAIN_LIMIT` | 25 | Process up to 25 pending budget claim retries per drain cycle. Keeps each cycle fast. |
| `DEFAULT_BACKGROUND_RETRY_DRAIN_MIN_INTERVAL_MS` | 60,000 (1 min) | Throttle: don't drain budget retries more than once per minute. Prevents hot-loop draining if many requests trigger retries concurrently. |
| `MAX_ERROR_TEXT_LENGTH` | 1,000 | Same as seat sync retries: truncates stored error messages. |

## Audit System

Defined in `lib/audit.ts`.

| Constant | Value | Why |
|----------|-------|-----|
| `AUDIT_BATCH_SIZE` | 25 | Flush 25 audit events per database insert. Balances write efficiency (fewer round-trips) against latency (events are persisted within ~200ms). |
| `AUDIT_FLUSH_INTERVAL_MS` | 200 | If the batch isn't full after 200ms, flush what we have. Keeps audit trail near-real-time without flushing on every single event. |
| `AUDIT_MAX_QUEUE_SIZE` | 1,000 (configurable via `AUDIT_MAX_QUEUE_SIZE`) | If the queue backs up (e.g., database is slow), drop oldest events after 1,000. Prevents unbounded memory growth. |
| `AUDIT_RETRY_MAX_INTERVAL_MS` | 5,000 (configurable via `AUDIT_RETRY_MAX_INTERVAL_MS`) | Exponential backoff cap for flush retries. 5 seconds is long enough to ride out transient failures without delaying audit persistence too long. |
| `AUDIT_RETRY_MAX_ATTEMPTS` | 5 (configurable via `AUDIT_RETRY_MAX_ATTEMPTS`) | After 5 consecutive failures, drop the batch and reset. Prevents a broken database connection from blocking the queue forever. |
| `AUDIT_RETRY_JITTER_FACTOR` | 0.2 (configurable via `AUDIT_RETRY_JITTER_FACTOR`) | Jitter multiplier for retry delays. The formula `1 + (Math.random() * 2 - 1) * 0.2` produces a random multiplier between 0.8 and 1.2. This spreads retry attempts across a +/-20% window to prevent multiple server instances from retrying in lockstep (thundering herd). |

## Caching

### Team Context Cache (`lib/team-context-cache.ts`)

| Constant | Value | Why |
|----------|-------|-----|
| `TEAM_CONTEXT_CACHE_TTL_SECONDS` | 30 | Team context (active team, role) is cached for 30 seconds. Short enough that role changes propagate quickly; long enough to avoid hitting the database on every API request in a burst. |
| `FALLBACK_SWEEP_INTERVAL_MS` | 30,000 (30 sec) | Same sweep interval as the rate limit store. Cleans expired entries from the in-memory cache. |
| `FALLBACK_MAX_ENTRIES` | 10,000 | Same cap as the rate limit store. 10k cached team contexts is more than enough for a single server instance. |

The cache reads from Redis first (shared across instances), falls back to in-memory (per-instance), then fetches from the database. This is defined in `getCachedTeamContextForUser()`.

## Logging & Sentry

Defined in `lib/logger.ts`.

| Constant | Value | Why |
|----------|-------|-----|
| `SENTRY_CONTEXT_MAX_DEPTH` | 4 | Maximum nesting depth when sanitizing objects for Sentry. Prevents deeply nested objects from causing stack overflows or massive payloads. |
| `SENTRY_CONTEXT_MAX_KEYS` | 50 | Maximum keys per object level sent to Sentry. Prevents large objects from bloating error reports. |
| `SENTRY_CONTEXT_MAX_ARRAY_ITEMS` | 20 | Maximum array items sent to Sentry. Same reasoning. |

### Sensitive Data Redaction

The logger redacts secrets from all output (console + Sentry). Patterns are defined in `SENSITIVE_VALUE_PATTERNS`:

| Pattern | What it catches |
|---------|----------------|
| `sk_(?:test|live)_...` | Stripe secret keys |
| `pk_(?:test|live)_...` | Stripe publishable keys |
| `whsec_...` | Stripe webhook secrets |
| `re_...` | Resend API keys |
| `sk-proj-...` | OpenAI API keys |
| `Bearer ...` | Authorization bearer tokens |

Keys matching `SENSITIVE_CONTEXT_KEY_RE` (`authorization`, `cookie`, `token`, `secret`, `password`, `api-key`, `session`, `set-cookie`) are redacted entirely from Sentry context objects.

## Request Validation

Defined in `lib/http/request-validation.ts`.

| Constant | Value | Why |
|----------|-------|-----|
| `DEFAULT_MAX_JSON_BYTES` | 262,144 (256KB) | Maximum request body size before the body is read. Prevents large payloads from consuming server memory. 256KB is generous for JSON payloads (most are under 10KB) while blocking multi-megabyte abuse. |

## Request Identification

Defined in `lib/http/request-id.ts`.

| Constant | Value | Why |
|----------|-------|-----|
| `REQUEST_ID_HEADER` | `"x-request-id"` | Standard header for request tracing. If the incoming request has one (from a load balancer or proxy), it's reused. Otherwise a new UUID is generated. |

## PostgreSQL Error Codes

Used as raw strings in various places:

| Code | Meaning | Where used |
|------|---------|------------|
| `23505` | Unique violation | Used in `app/api/team/invites/route.ts` (duplicate invite insert race-safe handling) and `app/api/stripe/webhook/event-claim.ts` (idempotent duplicate-claim handling). |
| `P0010` | Custom raise (last owner guard) | Raised by a DB trigger that prevents removing the last owner of a team. Caught in `app/api/team/members/[userId]/route.ts` and `app/dashboard/actions.ts` to return a user-safe error instead of a 500. |
