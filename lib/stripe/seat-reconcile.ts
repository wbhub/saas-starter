import { createAdminClient } from "@/lib/supabase/admin";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { syncTeamSeatQuantity } from "@/lib/stripe/seats";
import {
  clearSeatSyncRetry,
  enqueueSeatSyncRetry,
  listDueSeatSyncRetryTeamIds,
} from "@/lib/stripe/seat-sync-retries";
import { logger } from "@/lib/logger";
import { stripe } from "@/lib/stripe/server";
import { resolveTeamIdFromStripeCustomer } from "@/lib/stripe/sync";

type TeamSubscriptionRow = {
  team_id: string;
};

type ReconcileOptions = {
  batchSize?: number;
  includeStripeDiscovery?: boolean;
  stripePageLimit?: number;
  retryBatchSize?: number;
};

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

async function collectTeamIdsFromStripe(
  existingTeamIds: Set<string>,
  stripePageLimit: number,
) {
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
    }

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
  const batchSize = Math.max(1, options.batchSize ?? 500);
  const includeStripeDiscovery = options.includeStripeDiscovery ?? true;
  const stripePageLimit = Math.max(1, options.stripePageLimit ?? 20);
  const retryBatchSize = Math.max(1, options.retryBatchSize ?? 500);

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

  for (const teamId of teamIds) {
    try {
      await syncTeamSeatQuantity(teamId, {
        idempotencyKey: `seat-reconcile:${teamId}`,
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
  }

  return {
    scannedTeams: teamIds.length,
    synced,
    failed,
    queuedRetries,
    discoveredFromStripe,
    stripePagesScanned,
  };
}
