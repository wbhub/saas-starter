import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/cron/reconcile-seat-quantities", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", undefined);
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
    vi.doMock("@/lib/ai/budget-finalize-retries", () => ({
      processDueAiBudgetFinalizeRetries: vi.fn().mockResolvedValue({
        processed: 0,
        finalized: 0,
        skipped: 0,
        failed: 0,
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    vi.stubEnv("CRON_SECRET", "expected");
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
    vi.stubEnv("CRON_SECRET", "á");
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
    vi.stubEnv("CRON_SECRET", "expected");
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
    vi.doMock("@/lib/ai/budget-finalize-retries", () => ({
      processDueAiBudgetFinalizeRetries: vi.fn().mockResolvedValue({
        processed: 2,
        finalized: 1,
        skipped: 1,
        failed: 0,
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
    const { processDueAiBudgetFinalizeRetries } = await import(
      "@/lib/ai/budget-finalize-retries"
    );
    vi.mocked(processDueAiBudgetFinalizeRetries).mockResolvedValue({
      processed: 2,
      finalized: 1,
      skipped: 1,
      failed: 0,
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
      seatReconcileFailed: false,
      aiBudgetFinalizeRetries: {
        processed: 2,
        finalized: 1,
        skipped: 1,
        failed: 0,
      },
      aiBudgetFinalizeRetriesFailed: false,
    });
  });

  it("still runs AI finalize retries when seat reconciliation fails", async () => {
    vi.stubEnv("CRON_SECRET", "expected");
    vi.doMock("@/lib/ai/budget-finalize-retries", () => ({
      processDueAiBudgetFinalizeRetries: vi.fn().mockResolvedValue({
        processed: 1,
        finalized: 1,
        skipped: 0,
        failed: 0,
      }),
    }));
    const { reconcileTeamSeatQuantities } = await import("@/lib/stripe/seat-reconcile");
    vi.mocked(reconcileTeamSeatQuantities).mockRejectedValueOnce(new Error("stripe timeout"));
    const { processDueAiBudgetFinalizeRetries } = await import(
      "@/lib/ai/budget-finalize-retries"
    );
    const processRetries = vi
      .mocked(processDueAiBudgetFinalizeRetries)
      .mockResolvedValue({
        processed: 1,
        finalized: 1,
        skipped: 0,
        failed: 0,
      });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/reconcile-seat-quantities", {
        headers: { authorization: "Bearer expected" },
      }),
    );

    expect(response.status).toBe(500);
    expect(processRetries).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Cron run completed with one or more internal job failures.",
      scannedTeams: 0,
      synced: 0,
      failed: 0,
      queuedRetries: 0,
      discoveredFromStripe: 0,
      stripePagesScanned: 0,
      seatReconcileFailed: true,
      aiBudgetFinalizeRetries: {
        processed: 1,
        finalized: 1,
        skipped: 0,
        failed: 0,
      },
      aiBudgetFinalizeRetriesFailed: false,
    });
  });

  it("returns 500 when AI budget finalize retry processing fails", async () => {
    vi.stubEnv("CRON_SECRET", "expected");
    const { processDueAiBudgetFinalizeRetries } = await import(
      "@/lib/ai/budget-finalize-retries"
    );
    vi
      .mocked(processDueAiBudgetFinalizeRetries)
      .mockRejectedValueOnce(new Error("retry queue unavailable"));
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/reconcile-seat-quantities", {
        headers: { authorization: "Bearer expected" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Cron run completed with one or more internal job failures.",
      scannedTeams: 0,
      synced: 0,
      failed: 0,
      queuedRetries: 0,
      discoveredFromStripe: 0,
      stripePagesScanned: 0,
      seatReconcileFailed: false,
      aiBudgetFinalizeRetries: {
        processed: 0,
        finalized: 0,
        skipped: 0,
        failed: 0,
      },
      aiBudgetFinalizeRetriesFailed: true,
    });
  });
});
