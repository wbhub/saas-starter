import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/cron/prune-stripe-webhook-events", () => {
  const originalCron = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (originalCron === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCron;
    }
  });

  it("returns 503 when CRON_SECRET is not set", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/prune-stripe-webhook-events"),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Cron is not configured.",
    });
  });

  it("returns 401 when the secret does not match", async () => {
    process.env.CRON_SECRET = "expected";
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/prune-stripe-webhook-events", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized.",
    });
  });

  it("runs prune when the bearer token matches", async () => {
    process.env.CRON_SECRET = "expected";
    const prune = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/stripe/webhook-event-prune", () => ({
      pruneStripeWebhookEventRows: prune,
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/prune-stripe-webhook-events", {
        headers: { authorization: "Bearer expected" },
      }),
    );

    expect(response.status).toBe(200);
    expect(prune).toHaveBeenCalledWith();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("accepts secret via query string", async () => {
    process.env.CRON_SECRET = "qs-secret";
    const prune = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/stripe/webhook-event-prune", () => ({
      pruneStripeWebhookEventRows: prune,
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "http://localhost/api/cron/prune-stripe-webhook-events?secret=qs-secret",
      ),
    );

    expect(response.status).toBe(200);
    expect(prune).toHaveBeenCalled();
  });
});
