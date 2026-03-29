# Conventions

Patterns to follow when adding features to this codebase.

## Adding an API Route

Copy an existing route as your starting template. `app/api/auth/signup/route.ts` is a good reference for standalone routes; `app/api/team/invites/route.ts` shows how to use the `withTeamRoute` helper.

### Using `withAuthedRoute`

For routes that require an authenticated user but not team membership (e.g., invite acceptance, personal team recovery, support email), use the `withAuthedRoute` helper from `lib/http/authed-route.ts`:

```ts
import { withAuthedRoute } from "@/lib/http/authed-route";

export async function POST(request: Request) {
  return withAuthedRoute({
    request,
    schema: myZodSchema, // optional: parse + validate JSON body
    rateLimits: ({ userId }) => [
      {
        key: `my-feature:${userId}`,
        ...RATE_LIMITS.myFeatureByUser,
        message: t("errors.tooManyRequests"),
      },
    ],
    handler: async ({ user, supabase, body, requestId }) => {
      // Your business logic here.
      // user and body are already validated.
    },
  });
}
```

The middleware runs in this order: CSRF -> Content-Type -> Auth -> Rate limits -> Body parsing -> Your handler.

### Standalone route structure

For the rare case where neither `withTeamRoute` nor `withAuthedRoute` fits (e.g., unauthenticated endpoints like forgot-password, or Stripe webhook), follow this validation order:

```ts
export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  // 1. CSRF protection
  const csrfError = verifyCsrfProtection(request, { ... });
  if (csrfError) return withRequestId(csrfError, requestId);

  // 2. Content-Type check (for routes that accept JSON)
  const contentTypeError = requireJsonContentType(request, { ... });
  if (contentTypeError) return withRequestId(contentTypeError, requestId);

  // 3. Parse and validate body with Zod schema
  // 4. Authenticate (Supabase getUser) if needed
  // 5. Rate limit (checkRateLimit)
  // 6. Business logic
  // 7. Audit logging (logAuditEvent)
  // 8. Return response with withRequestId(jsonSuccess(...), requestId)
}
```

Prefer `withAuthedRoute` or `withTeamRoute` over manual pipelines. Use standalone structure only for documented exceptions. CSRF and content-type validation should happen before body parsing. Authentication should happen before rate limiting (so you can key limits on user ID), and rate limiting should happen before database writes.

### AI routes with `resolveAiRequestContext`

AI model routes (`/api/ai/chat`, `/api/ai/object`) share a custom pre-flight pipeline via `resolveAiRequestContext()` from `lib/ai/request-context.ts`. It handles CSRF, auth, team context, rate limiting, body parsing, subscription/plan resolution, AI access checks, modality validation, and budget claiming in one call. Use this instead of `withTeamRoute` for new AI endpoints that call AI models:

> **Note:** AI thread routes (`/api/ai/threads/...`) use `withTeamRoute` instead of `resolveAiRequestContext` because they are CRUD operations that don't invoke AI models or consume token budgets.

```ts
const result = await resolveAiRequestContext(request, {
  i18nNamespace: "ApiAiMyFeature",
  bodySchema: myPayloadSchema,
  rateLimitKeys: { user: "aiMyFeatureByUser", team: "aiMyFeatureByTeam", prefix: "ai-my-feature" },
  auditAction: "ai.my_feature.request",
  estimatePromptTokens: (body) => Math.ceil(body.prompt.length / 3),
  maxCompletionTokens: 2_048,
  skipTools: true, // set true if tools/maxSteps are not needed
});

if (!result.ok) return result.response;
const { requestId, user, teamContext, body, languageModel, budgetClaim, ... } = result.ctx;
```

### Using `withTeamRoute`

For routes that require team membership, use the `withTeamRoute` helper from `lib/http/team-route.ts`. It handles CSRF, content-type checks, auth, team membership/role checks, rate limits, and optional body parsing for you:

```ts
import { withTeamRoute } from "@/lib/http/team-route";

export async function POST(request: Request) {
  return withTeamRoute({
    request,
    allowedRoles: ["owner", "admin"], // optional: restrict to specific roles
    schema: myZodSchema, // optional: parse + validate JSON body
    rateLimits: ({ userId, teamId }) => [
      {
        key: `my-feature:${teamId}:${userId}`,
        ...RATE_LIMITS.myFeatureByActor,
        message: t("errors.tooManyRequests"),
      },
    ],
    handler: async ({ user, teamContext, body, requestId }) => {
      // Your business logic here.
      // user, teamContext, and body are already validated.
    },
  });
}
```

The middleware runs in this order: CSRF -> Content-Type -> Auth -> Team membership -> Role check -> Rate limits -> Body parsing -> Your handler.

### Adding rate limits

1. Add a new entry to `lib/constants/rate-limits.ts` using `MINUTE_MS` or `HOUR_MS` from `lib/constants/durations.ts`.
2. Reference it by name in your route's `rateLimits` callback.
3. Rate limit keys should follow the pattern `feature-name:scope:id` (e.g., `team-invite:create:${teamId}`).

### Adding a Zod schema

Define your request schema at the top of the route file, not in a separate types file. The pattern is:

```ts
const myPayloadSchema = z.object({
  email: z.string().trim().toLowerCase(),
  role: z.string().trim().toLowerCase(),
});
```

Use `parseJsonWithSchema(request, schema)` to parse the body. It handles size limits (default 256KB), malformed JSON, and Zod validation in one call.

## Adding a `lib/` Module

### When to create a new subdirectory

Create a new `lib/feature-name/` directory when:

- The feature has 2+ files (e.g., a config file, business logic, and types).
- The feature represents a distinct external integration (Stripe, Resend, Redis, etc.).
- The feature has its own set of constants or configuration.

### When to add to an existing directory

Add to an existing `lib/` subdirectory when the new code is clearly within that domain. For example, a new Stripe webhook handler belongs in `lib/stripe/`, not in a new directory.

### When to put something at `lib/` root

Only place a file at `lib/` root when it is a cross-cutting utility used by many domains. Current root files:

- `env.ts` -- type-safe environment variable access
- `logger.ts` -- structured logging with Sentry integration
- `audit.ts` -- audit event batching and persistence
- `validation.ts` -- shared validation (email, password, plan keys)
- `date.ts` -- UTC date formatting
- `team-context.ts` -- resolving a user's active team and role
- `team-context-cache.ts` -- multi-tier caching for team context
- `team-invites.ts` -- invite token generation and hashing
- `team-recovery.ts` -- personal team recovery RPC
- `utils.ts` -- Tailwind class merging (`cn()`)

If your new utility is only used by one domain, put it in that domain's directory.

## Environment Variables

### Adding a new variable

1. Add it to `.env.example` under the appropriate section with an inline comment explaining what it does and when it is needed.
2. Add the key to the appropriate type union in `lib/env.ts`:
   - `StaticServerEnvKey` for required variables that throw on missing.
   - `OptionalEnvKey` for variables that return `undefined` when missing.
3. Add a getter to the `envBase` object in `lib/env.ts`:
   - Use `ensureEnv("KEY")` for required variables (throws if missing).
   - Use `optionalEnv("KEY")` for optional variables (returns `undefined`).
4. For application/business logic, always use `env.MY_KEY` over direct `process.env` reads.

### The `env` proxy pattern

The `env` object uses lazy property getters. Each `get FOO()` only reads `process.env.FOO` when the property is first accessed. This means:

- Missing required variables only throw when the code path that needs them runs.
- `validateRequiredEnvAtBoot()` (called from `instrumentation.ts` in production Node runtime) forces critical getters to run, failing fast if configuration is wrong.
- The `void env.someKey` pattern in `validateRequiredEnvAtBoot` triggers the getter for its side effect (validation). It looks like a no-op but it is intentional.

### `process.env` allowlist

Direct `process.env` reads are **only** permitted in the following locations. All other application/business code must use `env.*` from `lib/env.ts`.

| Location                                                                            | Reason                                                                                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `lib/env.ts`                                                                        | The gateway itself -- reads `process.env` and exposes typed getters.                                      |
| `lib/billing/provider.ts`                                                           | Lightweight billing-provider detection imported by `lib/env.ts` (avoids circular dependency).             |
| `instrumentation.ts`, `instrumentation-client.ts`                                   | Sentry boot runs before the app is fully initialized.                                                     |
| `next.config.ts`                                                                    | Build-time configuration -- `lib/env.ts` is not available.                                                |
| `proxy.ts`                                                                          | Middleware/proxy-level boot checks.                                                                       |
| `sentry.*.config.ts`                                                                | Sentry SDK init files.                                                                                    |
| `trigger.config.ts`                                                                 | Trigger.dev SDK config runs in its own process.                                                           |
| `playwright.config.ts`, `e2e/**`                                                    | Test infrastructure.                                                                                      |
| `*.test.ts`                                                                         | Unit tests manipulating `process.env` for isolation.                                                      |
| `lib/audit.ts`                                                                      | Reads tuning parameters (`AUDIT_*`) with fallbacks; lightweight config, not business secrets.             |
| `app/dashboard/error.tsx`, `app/global-error.tsx`                                   | Client components that check `NEXT_PUBLIC_SENTRY_DSN` (inlined by Next.js).                               |
| `app/dashboard/actions.ts`                                                          | `NODE_ENV` check for CSRF cookie options.                                                                 |
| `lib/stripe/client.ts`                                                              | Client-side module; reads `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` which is inlined by Next.js at build time. |
| `scripts/`                                                                          | CI enforcement scripts that scan the file system — not application code.                                  |
| `NODE_ENV` in `lib/security/csrf.ts`, `lib/security/rate-limit.ts`, `lib/logger.ts` | Framework-level environment detection, not business config.                                               |

## Error Handling

### In API routes

**Canonical JSON contract:** All JSON API responses use a typed envelope produced by `jsonSuccess` and `jsonError` from `lib/http/api-json.ts`:

- **Success**: `{ ...data, ok: true }` with an appropriate 2xx status. The `ok` field is always set last to prevent accidental override.
- **Error**: `{ ok: false, error: string }` with an appropriate 4xx/5xx status. `jsonError` accepts an optional third argument with `code` (machine-readable string) and `data` (extra diagnostic fields merged into the body).
- **Optional fields**: `code` (e.g. `"budget_exceeded"`), `data` (diagnostic details on error responses, e.g. partial-failure summaries), `warning` (soft failure detail when the primary action succeeded but a side-effect failed, e.g. seat sync after member removal).
- All responses include an `x-request-id` header. Route wrappers (`withTeamRoute`, `withAuthedRoute`) attach this automatically; standalone routes should use `getOrCreateRequestId` / `withRequestId` from `lib/http/request-id.ts`.

Use the route's i18n translator `t()` for user-facing error messages. Do **not** use raw `NextResponse.json({ error }, { status })` in new or refactored code.

**Documented exceptions** (routes that intentionally deviate from the canonical envelope):

- **Stripe webhook** (`/api/stripe/webhook`): Returns `{ received: true }` on success -- Stripe expects this acknowledgment shape. Error responses still use `{ ok: false, error }`.
- **AI chat** (`/api/ai/chat`): Returns a streaming `text/plain` response on success (single-turn), or a UI message stream via `toUIMessageStreamResponse()` when agent tools are enabled. Error responses use the standard `{ ok: false, error, code }` envelope.
- **AI object** (`/api/ai/object`): Returns a streaming partial-JSON response via `streamObject().toTextStreamResponse()`. Consumed by `useObject` on the client. Error responses use the standard `{ ok: false, error, code }` envelope.
- **Forgot password** (`/api/auth/forgot-password`): Always returns `{ message }` (no `ok`) to avoid leaking whether the email exists.

Common status codes used in this codebase:

| Status | Meaning                | When to use                                                         |
| ------ | ---------------------- | ------------------------------------------------------------------- |
| 400    | Bad Request            | Invalid payload, failed Zod validation                              |
| 401    | Unauthorized           | No authenticated user                                               |
| 402    | Payment Required       | AI budget exceeded or paid plan required                            |
| 403    | Forbidden              | CSRF failure, insufficient role, missing team membership            |
| 404    | Not Found              | Resource doesn't exist                                              |
| 409    | Conflict               | Already exists, duplicate, same-state change                        |
| 410    | Gone                   | Expired resource (e.g., expired invite)                             |
| 413    | Payload Too Large      | Request body exceeds size limit                                     |
| 415    | Unsupported Media Type | Missing/invalid `Content-Type` for JSON endpoints                   |
| 429    | Too Many Requests      | Rate limited (include `Retry-After` for local rate-limit responses) |
| 503    | Service Unavailable    | Required service not configured or down                             |

Never expose internal error details to the client. Log the full error server-side with `logger.error()`, return a generic message to the user.

### In server actions

Return a state object: `{ status: "success" | "error" | "idle", message: string | null }`. Server actions use `verifyCsrfProtectionForServerAction()` instead of `verifyCsrfProtection()`.

### Throw vs. return null

The codebase uses both patterns depending on context:

- **Throw** when the caller cannot reasonably recover and the error represents a bug or infrastructure failure (e.g., `syncTeamSeatQuantity` throws when a subscription has no items).
- **Return null** when the absence of data is a normal, expected case (e.g., `resolveTeamIdFromStripeCustomer` returns null when a customer mapping doesn't exist yet).
- **Return an error response** in route handlers whenever possible. If lower-level code throws, catch and convert it to an appropriate `NextResponse`.

## Tests

### File naming and location

Tests are co-located with their source files:

```
lib/ai/access.ts          -> lib/ai/access.test.ts
app/api/auth/signup/route.ts -> app/api/auth/signup/route.test.ts
lib/dashboard/server.ts   -> lib/dashboard/server.test.ts
```

### Test runner

- **Unit tests**: Vitest (`vitest.config.ts`). Run with `npm test`.
- **E2E tests**: Playwright (`playwright.config.ts`). Located in `e2e/`. Run with `npx playwright test`.

Unit tests commonly use the `@/` path alias. E2E tests in `e2e/` usually use relative imports between fixture/spec files.

## Translations (i18n)

### Adding a new translation key

1. Add the key to `messages/en.json` under the appropriate namespace.
2. Add the same key to all other locale files (`es.json`, `pt.json`, `fr.json`, `de.json`, `zh.json`, `ja.json`, `ko.json`).
3. Namespaces match their usage context: `"ApiAuthSignup"` for the signup route, `"DashboardSettings"` for the settings page, etc.

Run `npm run lint:locales` after editing message catalogs to catch missing keys, type drift, or placeholder mismatches.

### Using translations in routes

```ts
const t = await getRouteTranslator("MyNamespace", request);
return jsonError(t("errors.invalidPayload"), 400);
```

### Using translations in components

```tsx
const t = useTranslations("MyNamespace");
return <p>{t("greeting")}</p>;
```

## Imports

For app and shared runtime code, prefer the `@/` path alias for local imports. Relative imports (`./`, `../`) are acceptable in tightly co-located files (for example, nearby UI components, tests, and e2e fixtures).

Group imports in this order:

1. React / Next.js framework imports
2. Third-party library imports
3. Local `@/lib/` imports
4. Local `@/components/` imports

Use `import type` for type-only imports:

```ts
import { type TeamContext, type TeamRole } from "@/lib/team-context";
```

## Audit Logging

Use `logAuditEvent()` from `lib/audit.ts` for any action that changes state (creates, updates, or deletes a resource). Every audit event includes `action` and `outcome`, and commonly includes:

- `action`: a dot-separated name like `"team.invite.create"` or `"ai.chat.stream"`
- `outcome`: `"success"`, `"failure"`, or `"denied"`
- `actorUserId`: who performed the action
- `teamId`: which team was affected (if applicable)
- `metadata`: additional context (e.g., `{ emailSent: true, reason: "duplicate" }`)

Audit events are batched (25 per batch) and flushed to the `audit_events` table with automatic retry on failure.

## Background Jobs (Trigger.dev)

When adding an operation that should run asynchronously:

1. Define the payload type and task ID in `lib/trigger/jobs/payloads.ts`.
2. Create the task in `lib/trigger/jobs/my-task.ts`.
3. Add a dispatch function in `lib/trigger/dispatch.ts`.
4. In your route, try Trigger.dev first, fall back to inline execution:

```ts
const triggered = await triggerMyTask(payload);
if (!triggered) {
  // Trigger.dev not configured or enqueue failed; run inline.
  await doTheWorkInline(payload);
}
```

This pattern ensures the feature works with or without Trigger.dev configured.

## Adding an AI Tool

When adding a new server-side tool for the AI agent:

1. Create `lib/ai/tools/my-tool.ts` with a Zod input schema and `tool()` from `ai`:

```ts
import { tool } from "ai";
import { z } from "zod";

const myToolParams = z.object({
  query: z.string().min(1).max(400),
});

export const myTool = tool({
  description: "What the tool does and when the model should use it.",
  inputSchema: myToolParams,
  execute: async ({ query }) => {
    const apiKey = process.env.MY_TOOL_API_KEY;
    if (!apiKey) return { error: "API key not configured." };
    // Call external API...
    return { result: "..." };
  },
});
```

2. Register in `lib/ai/tools/index.ts`, gated on the API key:

```ts
if (process.env.MY_TOOL_API_KEY) tools.myTool = myTool;
```

3. Add the env var to `lib/env.ts` as an `OptionalEnvKey` and to `.env.example`.
4. (Optional) Add a custom result renderer in `components/ai/tool-card.tsx` by adding an entry to `TOOL_RENDERERS`.

Validate tool inputs defensively: restrict URL schemes (no `file://`, `javascript:`), block private/internal hostnames for URL-based tools, and constrain string lengths.
