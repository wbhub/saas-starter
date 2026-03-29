import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

type StripeCustomerRow = {
  stripe_customer_id: string | null;
};

type GetOrCreateStripeCustomerForTeamParams = {
  stripe: Stripe;
  teamId: string;
  userId: string;
  email: string | null | undefined;
  idempotencyKey?: string;
};

function buildStripeCustomerMetadata(teamId: string, userId: string) {
  return {
    supabase_team_id: teamId,
    supabase_user_id: userId,
  };
}

export async function getOrCreateStripeCustomerForTeam({
  stripe,
  teamId,
  userId,
  email,
  idempotencyKey,
}: GetOrCreateStripeCustomerForTeamParams) {
  const admin = createAdminClient();
  const { data: customerRow, error: customerRowError } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("team_id", teamId)
    .maybeSingle<StripeCustomerRow>();

  if (customerRowError) {
    throw new Error(`Failed to load Stripe customer mapping: ${customerRowError.message}`);
  }

  const existingCustomerId = customerRow?.stripe_customer_id;
  if (existingCustomerId) {
    const customer = await stripe.customers.retrieve(existingCustomerId);

    if (!("deleted" in customer)) {
      const currentOwner = customer.metadata?.supabase_team_id;
      if (currentOwner && currentOwner !== teamId) {
        throw new Error("Stripe customer ownership metadata mismatch.");
      }

      const expectedMetadata = buildStripeCustomerMetadata(teamId, userId);
      const needsMetadataUpdate =
        customer.metadata?.supabase_team_id !== expectedMetadata.supabase_team_id ||
        customer.metadata?.supabase_user_id !== expectedMetadata.supabase_user_id;
      const nextEmail = customer.email ?? email ?? undefined;
      const needsEmailUpdate = Boolean(nextEmail && customer.email !== nextEmail);

      if (needsMetadataUpdate || needsEmailUpdate) {
        await stripe.customers.update(existingCustomerId, {
          email: nextEmail,
          metadata: {
            ...customer.metadata,
            ...expectedMetadata,
          },
        });
      }

      return existingCustomerId;
    }
  }

  const createdCustomer = await stripe.customers.create(
    {
      email: email ?? undefined,
      metadata: buildStripeCustomerMetadata(teamId, userId),
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  const { error: upsertError } = await admin.from("stripe_customers").upsert(
    {
      team_id: teamId,
      stripe_customer_id: createdCustomer.id,
    },
    { onConflict: "team_id" },
  );

  if (upsertError) {
    throw new Error(`Failed to upsert Stripe customer mapping: ${upsertError.message}`);
  }

  return createdCustomer.id;
}
