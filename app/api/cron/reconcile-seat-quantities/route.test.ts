import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/cron/reconcile-seat-quantities", () => {
  const originalCron = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    }));
    vi.doMock("@/lib/stripe/seat-reconcile", () => ({
      reconcileTeamSeatQuantities: vi.fn().mockResolvedValue({
        scannedTeams: 0,
        synced: 0,
        failed: 0,
        queuedRetries: 0,
        discoveredFromStripe: 0,
        stripePagesScanned: 0,
      }),
    }));
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
      new Request("http://localhost/api/cron/reconcile-seat-quantities"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Cron is not configured.",
    });
  });

  it("returns 401 when bearer token is invalid", async () => {
    process.env.CRON_SECRET = "expected";
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/reconcile-seat-quantities", {
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized.",
    });
  });

  it("returns 401 for unicode token mismatch without throwing", async () => {
    process.env.CRON_SECRET = "á";
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/reconcile-seat-quantities", {
        headers: { authorization: "Bearer a" },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized.",
    });
  });

  it("runs seat reconciliation when bearer token matches", async () => {
    process.env.CRON_SECRET = "expected";
    vi.doMock("@/lib/stripe/seat-reconcile", () => ({
      reconcileTeamSeatQuantities: vi.fn().mockResolvedValue({
        scannedTeams: 3,
        synced: 3,
        failed: 0,
        queuedRetries: 1,
        discoveredFromStripe: 1,
        stripePagesScanned: 1,
      }),
    }));
    const { reconcileTeamSeatQuantities } = await import("@/lib/stripe/seat-reconcile");
    const reconcile = vi.mocked(reconcileTeamSeatQuantities).mockResolvedValue({
      scannedTeams: 3,
      synced: 3,
      failed: 0,
      queuedRetries: 1,
      discoveredFromStripe: 1,
      stripePagesScanned: 1,
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/reconcile-seat-quantities", {
        headers: { authorization: "Bearer expected" },
      }),
    );

    expect(response.status).toBe(200);
    expect(reconcile).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      scannedTeams: 3,
      synced: 3,
      failed: 0,
      queuedRetries: 1,
      discoveredFromStripe: 1,
      stripePagesScanned: 1,
    });
  });
});
