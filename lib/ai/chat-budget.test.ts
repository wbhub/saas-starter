import { beforeEach, describe, expect, it, vi } from "vitest";

describe("chat-budget helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns a claim when budget RPC allows the request", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, claim_id: "claim_1", month_start: "2026-03-01T00:00:00.000Z" }],
      error: null,
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));

    const { claimTeamAiBudget } = await import("./chat-budget");
    const result = await claimTeamAiBudget({
      teamId: "team_1",
      tokenBudget: 10_000,
      projectedTokens: 2_000,
    });

    expect(result).toEqual({
      claimId: "claim_1",
      monthStart: "2026-03-01T00:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledWith(
      "claim_ai_token_budget",
      expect.objectContaining({
        p_team_id: "team_1",
        p_token_budget: 10_000,
        p_projected_tokens: 2_000,
      }),
    );
  });

  it("returns null when budget claim is denied or exceeded", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: false, claim_id: null, month_start: "2026-03-01T00:00:00.000Z" }],
      error: null,
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));

    const { claimTeamAiBudget } = await import("./chat-budget");
    await expect(
      claimTeamAiBudget({
        teamId: "team_1",
        tokenBudget: 10_000,
        projectedTokens: 100_000,
      }),
    ).resolves.toBeNull();
  });

  it("finalizes a claim with the provided actual token count", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));

    const { finalizeTeamAiBudgetClaim } = await import("./chat-budget");
    await finalizeTeamAiBudgetClaim({
      claimId: "claim_2",
      actualTokens: 314,
    });

    expect(rpc).toHaveBeenCalledWith("finalize_ai_token_budget_claim", {
      p_claim_id: "claim_2",
      p_actual_tokens: 314,
    });
  });

  it("enqueues a retry when finalization fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "finalize failed" } });
    const enqueueAiBudgetFinalizeRetry = vi.fn().mockResolvedValue(undefined);
    const logger = { error: vi.fn(), warn: vi.fn() };

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));
    vi.doMock("@/lib/ai/budget-finalize-retries", () => ({
      enqueueAiBudgetFinalizeRetry,
    }));
    vi.doMock("@/lib/logger", () => ({
      logger,
    }));

    const { finalizeTeamAiBudgetClaimWithRetry } = await import("./chat-budget");
    await expect(
      finalizeTeamAiBudgetClaimWithRetry({
        claimId: "claim_3",
        actualTokens: 88,
        context: { teamId: "team_1", userId: "user_1", model: "gpt-5" },
        onFinalizeFailureMessage: "finalize failed",
        onEnqueueFailureMessage: "enqueue failed",
      }),
    ).resolves.toBe(false);

    expect(enqueueAiBudgetFinalizeRetry).toHaveBeenCalledWith({
      claimId: "claim_3",
      actualTokens: 88,
      error: expect.objectContaining({ message: "finalize failed" }),
    });
  });

  it("logs enqueue errors but does not throw when retry enqueue also fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "finalize failed" } });
    const enqueueAiBudgetFinalizeRetry = vi.fn().mockRejectedValue(new Error("redis unavailable"));
    const logger = { error: vi.fn(), warn: vi.fn() };

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));
    vi.doMock("@/lib/ai/budget-finalize-retries", () => ({
      enqueueAiBudgetFinalizeRetry,
    }));
    vi.doMock("@/lib/logger", () => ({
      logger,
    }));

    const { finalizeTeamAiBudgetClaimWithRetry } = await import("./chat-budget");
    await expect(
      finalizeTeamAiBudgetClaimWithRetry({
        claimId: "claim_4",
        actualTokens: 0,
        context: { teamId: "team_1", userId: "user_1", model: "gpt-5" },
        onFinalizeFailureMessage: "Failed to finalize",
        onEnqueueFailureMessage: "Failed to enqueue retry",
      }),
    ).resolves.toBe(false);

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to enqueue retry",
      expect.any(Error),
      expect.objectContaining({
        teamId: "team_1",
        userId: "user_1",
        model: "gpt-5",
        claimId: "claim_4",
      }),
    );
  });
});
