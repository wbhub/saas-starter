import { task } from "@trigger.dev/sdk/v3";
import { reconcileTeamSeatQuantities } from "@/lib/stripe/seat-reconcile";
import {
  TRIGGER_TASK_IDS,
  type ReconcileSeatQuantitiesPayload,
} from "@/lib/trigger/jobs/payloads";

export const reconcileSeatQuantitiesTask = task({
  id: TRIGGER_TASK_IDS.reconcileSeatQuantities,
  run: async (payload: ReconcileSeatQuantitiesPayload) => {
    return reconcileTeamSeatQuantities({
      includeStripeDiscovery: payload.includeStripeDiscovery,
      stripePageLimit: payload.stripePageLimit,
      batchSize: payload.batchSize,
      retryBatchSize: payload.retryBatchSize,
      syncConcurrency: payload.syncConcurrency,
    });
  },
});
