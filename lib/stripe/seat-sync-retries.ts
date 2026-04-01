import { createAdminClient } from "@/lib/supabase/admin";

const BASE_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 60 * 60_000;
const MAX_ERROR_TEXT_LENGTH = 1_000;

type SeatSyncRetryRow = {
  team_id: string;
  attempt_count: number;
};

function computeRetryDelayMs(attemptCount: number) {
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptCount - 1));
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, MAX_ERROR_TEXT_LENGTH);
  }
  if (typeof error === "string") {
    return error.slice(0, MAX_ERROR_TEXT_LENGTH);
  }
  return "Unknown seat sync failure";
}

export async function enqueueSeatSyncRetry({
  teamId,
  source,
  error,
}: {
  teamId: string;
  source: string;
  error: unknown;
}) {
  const admin = createAdminClient();
  const { data: existing, error: selectError } = await admin
    .from("seat_sync_retries")
    .select("team_id,attempt_count")
    .eq("team_id", teamId)
    .maybeSingle<SeatSyncRetryRow>();

  if (selectError) {
    throw new Error(`Failed to read existing seat sync retry: ${selectError.message}`);
  }

  const nextAttemptCount = (existing?.attempt_count ?? 0) + 1;
  const now = new Date();
  const nextAttemptAt = new Date(now.getTime() + computeRetryDelayMs(nextAttemptCount));

  const { error: upsertError } = await admin.from("seat_sync_retries").upsert(
    {
      team_id: teamId,
      reason: source,
      attempt_count: nextAttemptCount,
      last_error: toErrorMessage(error),
      last_attempt_at: now.toISOString(),
      next_attempt_at: nextAttemptAt.toISOString(),
    },
    { onConflict: "team_id" },
  );

  if (upsertError) {
    throw new Error(`Failed to enqueue seat sync retry: ${upsertError.message}`);
  }
}

export async function preEnqueueSeatSyncRetries(teamIds: string[], source: string) {
  if (teamIds.length === 0) {
    return;
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const rows = teamIds.map((teamId) => ({
    team_id: teamId,
    reason: source,
    attempt_count: 0,
    next_attempt_at: now,
  }));

  const { error } = await admin
    .from("seat_sync_retries")
    .upsert(rows, { onConflict: "team_id", ignoreDuplicates: true });

  if (error) {
    throw new Error(`Failed to pre-enqueue seat sync retries: ${error.message}`);
  }
}

export async function clearSeatSyncRetry(teamId: string) {
  const { error } = await createAdminClient()
    .from("seat_sync_retries")
    .delete()
    .eq("team_id", teamId);

  if (error) {
    throw new Error(`Failed to clear seat sync retry: ${error.message}`);
  }
}

export async function listDueSeatSyncRetryTeamIds(limit: number) {
  const nowIso = new Date().toISOString();
  const safeLimit = Math.max(1, limit);
  const { data, error } = await createAdminClient()
    .from("seat_sync_retries")
    .select("team_id")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(safeLimit);

  if (error) {
    throw new Error(`Failed to load due seat sync retries: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => row.team_id)
    .filter((teamId): teamId is string => typeof teamId === "string" && teamId.length > 0);
}
