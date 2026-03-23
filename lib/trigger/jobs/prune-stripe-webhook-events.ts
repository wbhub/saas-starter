import { task } from "@trigger.dev/sdk/v3";
import { pruneStripeWebhookEventRows } from "@/lib/stripe/webhook-event-prune";
import {
  TRIGGER_TASK_IDS,
  type PruneStripeWebhookEventsPayload,
} from "@/lib/trigger/jobs/payloads";

export const pruneStripeWebhookEventsTask = task({
  id: TRIGGER_TASK_IDS.pruneStripeWebhookEvents,
  run: async (payload: PruneStripeWebhookEventsPayload) => {
    await pruneStripeWebhookEventRows({ sampleRate: payload.sampleRate ?? 1 });
    return { ok: true as const };
  },
});
