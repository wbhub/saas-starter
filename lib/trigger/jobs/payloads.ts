export const TRIGGER_TASK_IDS = {
  stripeWebhookProcess: "stripe-webhook-process",
  reconcileSeatQuantities: "reconcile-seat-quantities",
  pruneStripeWebhookEvents: "prune-stripe-webhook-events",
  sendEmail: "send-email",
  aiBudgetFinalizeRetries: "ai-budget-finalize-retries",
} as const;

export type StripeWebhookProcessPayload = {
  eventId: string;
};

export type ReconcileSeatQuantitiesPayload = {
  includeStripeDiscovery?: boolean;
  stripePageLimit?: number;
  batchSize?: number;
  retryBatchSize?: number;
  syncConcurrency?: number;
};

export type PruneStripeWebhookEventsPayload = {
  sampleRate?: number;
};

export type SendEmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export type AiBudgetFinalizeRetriesPayload = {
  limit?: number;
};
