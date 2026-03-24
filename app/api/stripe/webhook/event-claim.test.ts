import { beforeEach, describe, expect, it, vi } from "vitest";

function createWebhookEventsAdminMock({
  insertResult = { error: null as { code?: string; message: string } | null },
  updateResult = {
    data: [] as Array<{ stripe_event_id: string }>,
    error: null as { message: string } | null,
  },
} = {}) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const updateLimit = vi.fn().mockResolvedValue(updateResult);
  const updateBuilder = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    limit: updateLimit,
  };
  const update = vi.fn(() => updateBuilder);
  const from = vi.fn((table: string) => {
    if (table !== "stripe_webhook_events") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return {
      insert,
      update,
    };
  });

  return {
    from,
    insert,
    update,
    updateBuilder,
    updateLimit,
  };
}

describe("webhook event claim lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("claims an event on first insert", async () => {
    const admin = createWebhookEventsAdminMock();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { claimWebhookEvent } = await import("./event-claim");
    const result = await claimWebhookEvent({ id: "evt_1", type: "invoice.created" } as never);

    expect(result.claimed).toBe(true);
    expect(result.claimToken).toEqual(expect.any(String));
    expect(admin.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_event_id: "evt_1",
        event_type: "invoice.created",
        claim_token: expect.any(String),
        completed_at: null,
      }),
    );
  });

  it("returns claimed false when duplicate claim cannot be reclaimed", async () => {
    const admin = createWebhookEventsAdminMock({
      insertResult: { error: { code: "23505", message: "duplicate" } },
      updateResult: { data: [], error: null },
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { claimWebhookEvent } = await import("./event-claim");
    const result = await claimWebhookEvent({ id: "evt_2", type: "invoice.created" } as never);

    expect(result).toEqual({ claimed: false, claimToken: null });
    expect(admin.update).toHaveBeenCalledTimes(1);
  });

  it("reclaims a stale duplicate event when expired claim exists", async () => {
    const admin = createWebhookEventsAdminMock({
      insertResult: { error: { code: "23505", message: "duplicate" } },
      updateResult: { data: [{ stripe_event_id: "evt_3" }], error: null },
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { claimWebhookEvent } = await import("./event-claim");
    const result = await claimWebhookEvent({ id: "evt_3", type: "invoice.created" } as never);

    expect(result.claimed).toBe(true);
    expect(result.claimToken).toEqual(expect.any(String));
    expect(admin.updateBuilder.lt).toHaveBeenCalledWith("claim_expires_at", expect.any(String));
  });

  it("extends claim heartbeat ttl for in-flight event", async () => {
    const admin = createWebhookEventsAdminMock();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { extendWebhookEventClaim } = await import("./event-claim");
    await extendWebhookEventClaim("evt_hb", "token_hb");

    expect(admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        claim_expires_at: expect.any(String),
        processed_at: expect.any(String),
      }),
    );
    expect(admin.updateBuilder.eq).toHaveBeenCalledWith("stripe_event_id", "evt_hb");
    expect(admin.updateBuilder.eq).toHaveBeenCalledWith("claim_token", "token_hb");
  });

  it("marks event as processed by setting completed_at and clearing claim expiry", async () => {
    const admin = createWebhookEventsAdminMock();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { markWebhookEventProcessed } = await import("./event-claim");
    await markWebhookEventProcessed("evt_done", "token_done");

    expect(admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        completed_at: expect.any(String),
        claim_expires_at: null,
      }),
    );
  });

  it("releases claim by expiring claim_expires_at immediately", async () => {
    const admin = createWebhookEventsAdminMock();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { releaseWebhookEventClaim } = await import("./event-claim");
    await releaseWebhookEventClaim("evt_release", "token_release");

    expect(admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        claim_expires_at: expect.any(String),
      }),
    );
    expect(admin.updateBuilder.eq).toHaveBeenCalledWith("stripe_event_id", "evt_release");
    expect(admin.updateBuilder.eq).toHaveBeenCalledWith("claim_token", "token_release");
  });
});
