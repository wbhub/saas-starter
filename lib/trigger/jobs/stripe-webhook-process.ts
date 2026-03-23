import { task } from "@trigger.dev/sdk/v3";
import { claimAndProcessStripeWebhookEventById } from "@/lib/stripe/webhook-processing";
import {
  TRIGGER_TASK_IDS,
  type StripeWebhookProcessPayload,
} from "@/lib/trigger/jobs/payloads";

export const stripeWebhookProcessTask = task({
  id: TRIGGER_TASK_IDS.stripeWebhookProcess,
  run: async (payload: StripeWebhookProcessPayload) => {
    await claimAndProcessStripeWebhookEventById(payload.eventId);
    return { ok: true as const };
  },
});
