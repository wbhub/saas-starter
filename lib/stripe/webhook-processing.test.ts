import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const syncSubscription = vi.fn();
const upsertStripeCustomer = vi.fn();
const handleCustomerDeleted = vi.fn();
const loggerInfo = vi.fn();
const loggerWarn = vi.fn();
const loggerError = vi.fn();

vi.mock("@/lib/stripe/sync", () => ({
  syncSubscription,
  upsertStripeCustomer,
  handleCustomerDeleted,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: loggerInfo, warn: loggerWarn, error: loggerError },
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripeServerClient: () => ({
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        id: "sub_123",
        status: "past_due",
        customer: "cus_123",
        cancel_at_period_end: false,
        created: 1_700_000_000,
        items: {
          data: [
            {
              id: "si_123",
              quantity: 1,
              price: { id: "price_starter" },
              current_period_start: 1_700_000_000,
              current_period_end: 1_700_086_400,
            },
          ],
        },
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

function makeEvent(type: string, dataObject: Record<string, unknown>): Stripe.Event {
  return {
    id: `evt_${type.replace(/\./g, "_")}`,
    type,
    created: 1_700_000_100,
    data: { object: dataObject },
  } as unknown as Stripe.Event;
}

describe("processStripeWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles customer.subscription.paused via syncSubscription", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-processing");
    const sub = {
      id: "sub_paused",
      status: "paused",
      customer: "cus_123",
    };
    await processStripeWebhookEvent(makeEvent("customer.subscription.paused", sub));
    expect(syncSubscription).toHaveBeenCalledWith(sub, {
      eventCreatedUnix: 1_700_000_100,
    });
  });

  it("handles invoice.payment_failed — logs warning and syncs subscription (legacy top-level subscription)", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-processing");
    const invoice = {
      id: "in_fail",
      subscription: "sub_123",
      customer: "cus_123",
      amount_due: 2000,
      currency: "usd",
      attempt_count: 2,
    };
    await processStripeWebhookEvent(makeEvent("invoice.payment_failed", invoice));
    expect(loggerWarn).toHaveBeenCalledWith(
      "Stripe invoice payment failed",
      expect.objectContaining({ invoiceId: "in_fail", subscriptionId: "sub_123" }),
    );
    expect(syncSubscription).toHaveBeenCalled();
  });

  it("handles invoice.payment_failed — resolves subscription from parent.subscription_details", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-processing");
    const invoice = {
      id: "in_fail2",
      customer: "cus_456",
      amount_due: 1000,
      currency: "usd",
      attempt_count: 1,
      parent: {
        type: "subscription_details",
        quote_details: null,
        subscription_details: {
          subscription: "sub_parent",
          metadata: null,
        },
      },
    };
    await processStripeWebhookEvent(makeEvent("invoice.payment_failed", invoice));
    expect(loggerWarn).toHaveBeenCalledWith(
      "Stripe invoice payment failed",
      expect.objectContaining({ invoiceId: "in_fail2", subscriptionId: "sub_parent" }),
    );
    expect(syncSubscription).toHaveBeenCalled();
  });

  it("handles customer.deleted — logs and calls handleCustomerDeleted", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-processing");
    const customer = { id: "cus_deleted" };
    await processStripeWebhookEvent(makeEvent("customer.deleted", customer));
    expect(loggerWarn).toHaveBeenCalledWith(
      "Stripe customer deleted",
      expect.objectContaining({ customerId: "cus_deleted" }),
    );
    expect(handleCustomerDeleted).toHaveBeenCalledWith("cus_deleted");
  });

  it("handles charge.dispute.created — logs error", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-processing");
    const dispute = {
      id: "dp_123",
      charge: "ch_123",
      amount: 5000,
      currency: "usd",
      reason: "fraudulent",
      status: "needs_response",
    };
    await processStripeWebhookEvent(makeEvent("charge.dispute.created", dispute));
    expect(loggerError).toHaveBeenCalledWith(
      "Stripe dispute created — manual action required",
      expect.objectContaining({
        disputeId: "dp_123",
        reason: "fraudulent",
      }),
    );
  });

  it("logs unhandled event types at info level", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-processing");
    await processStripeWebhookEvent(makeEvent("some.unknown.event", { id: "obj_1" }));
    expect(loggerInfo).toHaveBeenCalledWith(
      "Unhandled Stripe webhook event type",
      expect.objectContaining({ eventType: "some.unknown.event" }),
    );
  });
});
