import { createAdminClient } from "@/lib/supabase/admin";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { syncTeamSeatQuantity } from "@/lib/stripe/seats";
import {
  clearSeatSyncRetry,
  enqueueSeatSyncRetry,
  listDueSeatSyncRetryTeamIds,
} from "@/lib/stripe/seat-sync-retries";
import { logger } from "@/lib/logger";
import { getStripeServerClient } from "@/lib/stripe/server";
import { resolveTeamIdFromStripeCustomer } from "@/lib/stripe/sync";
import { isBillingEnabled } from "@/lib/billing/capabilities";

type TeamSubscriptionRow = {
  team_id: string;
};

type ReconcileOptions = {
  batchSize?: number;
  includeStripeDiscovery?: boolean;
  stripePageLimit?: number;
  retryBatchSize?: number;
  syncConcurrency?: number;
};

const DEFAULT_SYNC_CONCURRENCY = 10;
const DEFAULT_STRIPE_DISCOVERY_CONCURRENCY = 10;

export async function runInBatches<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  if (items.length === 0) {
    return;
  }

  const safeConcurrency = Math.max(1, concurrency);
  for (let start = 0; start < items.length; start += safeConcurrency) {
    const batch = items.slice(start, start + safeConcurrency);
    await Promise.all(batch.map((item, index) => worker(item, start + index)));
  }
}

async function collectTeamIdsFromDatabase(batchSize: number) {
  const teamIds = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await createAdminClient()
      .from("subscriptions")
      .select("team_id")
      .in("status", LIVE_SUBSCRIPTION_STATUSES)
      .order("updated_at", { ascending: false })
      .range(offset, offset + batchSize - 1)
      .returns<TeamSubscriptionRow[]>();

    if (error) {
      throw new Error(`Failed to load teams for seat reconciliation: ${error.message}`);
    }

    const rows = data ?? [];
    for (const row of rows) {
      teamIds.add(row.team_id);
    }

    if (rows.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return teamIds;
}

async function collectTeamIdsFromStripe(existingTeamIds: Set<string>, stripePageLimit: number) {
  const stripe = getStripeServerClient();
  if (!stripe) {
    logger.warn("Stripe is not configured; skipping Stripe team discovery during reconciliation.");
    return { discovered: 0, pagesScanned: 0 };
  }

  let discovered = 0;
  let pagesScanned = 0;
  let startingAfter: string | undefined;
  const seenCustomers = new Set<string>();

  while (pagesScanned < stripePageLimit) {
    const page = await stripe.subscriptions.list({
      status: "all",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    pagesScanned += 1;

    const customerIds: string[] = [];
    for (const subscription of page.data) {
      if (!LIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
        continue;
      }

      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      if (!customerId || seenCustomers.has(customerId)) {
        continue;
      }
      seenCustomers.add(customerId);
      customerIds.push(customerId);
    }

    await runInBatches(customerIds, DEFAULT_STRIPE_DISCOVERY_CONCURRENCY, async (customerId) => {
      try {
        const teamId = await resolveTeamIdFromStripeCustomer(customerId);
        if (teamId && !existingTeamIds.has(teamId)) {
          existingTeamIds.add(teamId);
          discovered += 1;
        }
      } catch (error) {
        logger.error("Failed to resolve team while reconciling from Stripe discovery", {
          customerId,
          error,
        });
      }
    });

    if (!page.has_more) {
      break;
    }

    const last = page.data[page.data.length - 1];
    if (!last) {
      break;
    }
    startingAfter = last.id;
  }

  return { discovered, pagesScanned };
}

export async function reconcileTeamSeatQuantities(options: ReconcileOptions = {}) {
  if (!isBillingEnabled()) {
    return {
      scannedTeams: 0,
      synced: 0,
      failed: 0,
      queuedRetries: 0,
      discoveredFromStripe: 0,
      stripePagesScanned: 0,
    };
  }

  const batchSize = Math.max(1, options.batchSize ?? 500);
  const includeStripeDiscovery = options.includeStripeDiscovery ?? true;
  const stripePageLimit = Math.max(1, options.stripePageLimit ?? 20);
  const retryBatchSize = Math.max(1, options.retryBatchSize ?? 500);
  const syncConcurrency = Math.max(1, options.syncConcurrency ?? DEFAULT_SYNC_CONCURRENCY);
  const runKey = `seat-reconcile:${Date.now()}`;

  const teamIdSet = await collectTeamIdsFromDatabase(batchSize);
  let queuedRetries = 0;
  try {
    const dueRetryTeamIds = await listDueSeatSyncRetryTeamIds(retryBatchSize);
    queuedRetries = dueRetryTeamIds.length;
    for (const teamId of dueRetryTeamIds) {
      teamIdSet.add(teamId);
    }
  } catch (error) {
    logger.error("Failed to load due seat sync retries for reconciliation run", error);
  }

  let discoveredFromStripe = 0;
  let stripePagesScanned = 0;

  if (includeStripeDiscovery) {
    const stripeDiscovery = await collectTeamIdsFromStripe(teamIdSet, stripePageLimit);
    discoveredFromStripe = stripeDiscovery.discovered;
    stripePagesScanned = stripeDiscovery.pagesScanned;
  }

  const teamIds = Array.from(teamIdSet);
  let synced = 0;
  let failed = 0;

  await runInBatches(teamIds, syncConcurrency, async (teamId, index) => {
    try {
      await syncTeamSeatQuantity(teamId, {
        idempotencyKey: `${runKey}:${teamId}:${index}`,
      });
      try {
        await clearSeatSyncRetry(teamId);
      } catch (clearError) {
        logger.error("Failed to clear seat sync retry after successful reconciliation", {
          teamId,
          error: clearError,
        });
      }
      synced += 1;
    } catch (syncError) {
      failed += 1;
      logger.error("Failed to reconcile team seat quantity", {
        teamId,
        error: syncError,
      });
      try {
        await enqueueSeatSyncRetry({
          teamId,
          source: "cron.reconcile-seat-quantities",
          error: syncError,
        });
      } catch (retryError) {
        logger.error("Failed to enqueue seat sync retry during reconciliation", {
          teamId,
          error: retryError,
        });
      }
    }
  });

  return {
    scannedTeams: teamIds.length,
    synced,
    failed,
    queuedRetries,
    discoveredFromStripe,
    stripePagesScanned,
  };
}
