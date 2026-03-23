import { triggerTaskIfConfigured } from "@/lib/trigger/client";
import {
  TRIGGER_TASK_IDS,
  type AiBudgetFinalizeRetriesPayload,
  type PruneStripeWebhookEventsPayload,
  type ReconcileSeatQuantitiesPayload,
  type SendEmailPayload,
  type StripeWebhookProcessPayload,
} from "@/lib/trigger/jobs/payloads";

export async function triggerStripeWebhookProcessTask(payload: StripeWebhookProcessPayload) {
  return triggerTaskIfConfigured(TRIGGER_TASK_IDS.stripeWebhookProcess, payload);
}

export async function triggerReconcileSeatQuantitiesTask(payload: ReconcileSeatQuantitiesPayload = {}) {
  return triggerTaskIfConfigured(TRIGGER_TASK_IDS.reconcileSeatQuantities, payload);
}

export async function triggerPruneStripeWebhookEventsTask(
  payload: PruneStripeWebhookEventsPayload = {},
) {
  return triggerTaskIfConfigured(TRIGGER_TASK_IDS.pruneStripeWebhookEvents, payload);
}

export async function triggerSendEmailTask(payload: SendEmailPayload) {
  return triggerTaskIfConfigured(TRIGGER_TASK_IDS.sendEmail, payload);
}

export async function triggerAiBudgetFinalizeRetriesTask(
  payload: AiBudgetFinalizeRetriesPayload = {},
) {
  return triggerTaskIfConfigured(TRIGGER_TASK_IDS.aiBudgetFinalizeRetries, payload);
}
