import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type AiThread = {
  id: string;
  teamId: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiThreadMessage = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  parts: unknown[];
  attachments: unknown[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type ThreadRow = {
  id: string;
  team_id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type ThreadMessageRow = {
  id: string;
  thread_id: string;
  role: string;
  parts: unknown[];
  attachments: unknown[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function toThread(row: ThreadRow): AiThread {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toThreadMessage(row: ThreadMessageRow): AiThreadMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role as "user" | "assistant",
    parts: Array.isArray(row.parts) ? row.parts : [],
    attachments: Array.isArray(row.attachments) ? row.attachments : null,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export async function createThread({
  id,
  teamId,
  userId,
  title,
}: {
  id?: string;
  teamId: string;
  userId: string;
  title?: string;
}): Promise<AiThread | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_threads")
    .insert({
      ...(id ? { id } : {}),
      team_id: teamId,
      user_id: userId,
      title: title ?? null,
    })
    .select("*")
    .single<ThreadRow>();

  if (error) {
    logger.error("Failed to create AI thread", error, { teamId, userId });
    return null;
  }
  return toThread(data);
}

export async function listThreads({
  teamId,
  userId,
  limit = 50,
  offset = 0,
}: {
  teamId: string;
  userId: string;
  limit?: number;
  offset?: number;
}): Promise<AiThread[]> {
  const clampedLimit = Math.min(Math.max(limit, 1), 100);
  const clampedOffset = Math.max(offset, 0);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_threads")
    .select("*")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(clampedOffset, clampedOffset + clampedLimit - 1)
    .returns<ThreadRow[]>();

  if (error) {
    logger.error("Failed to list AI threads", error, { teamId, userId });
    return [];
  }
  return data.map(toThread);
}

export async function getThread({
  threadId,
  teamId,
  userId,
}: {
  threadId: string;
  teamId: string;
  userId: string;
}): Promise<AiThread | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_threads")
    .select("*")
    .eq("id", threadId)
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle<ThreadRow>();

  if (error) {
    logger.error("Failed to get AI thread", error, { threadId, teamId, userId });
    return null;
  }
  return data ? toThread(data) : null;
}

export async function renameThread({
  threadId,
  teamId,
  userId,
  title,
}: {
  threadId: string;
  teamId: string;
  userId: string;
  title: string;
}): Promise<AiThread | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_threads")
    .update({ title })
    .eq("id", threadId)
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle<ThreadRow>();

  if (error) {
    logger.error("Failed to rename AI thread", error, { threadId, teamId, userId });
    return null;
  }
  return data ? toThread(data) : null;
}

export async function deleteThread({
  threadId,
  teamId,
  userId,
}: {
  threadId: string;
  teamId: string;
  userId: string;
}): Promise<"deleted" | "not_found" | "error"> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_threads")
    .delete()
    .eq("id", threadId)
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .select("id")
    .returns<{ id: string }[]>();

  if (error) {
    logger.error("Failed to delete AI thread", error, { threadId, teamId, userId });
    return "error";
  }
  return (data?.length ?? 0) > 0 ? "deleted" : "not_found";
}

export async function saveThreadMessages({
  threadId,
  teamId,
  userId,
  messages,
  ownershipVerified = false,
}: {
  threadId: string;
  teamId: string;
  userId: string;
  messages: Array<{
    role: "user" | "assistant";
    parts: unknown[];
    attachments?: unknown[];
    metadata?: Record<string, unknown>;
  }>;
  /** Set to true when the caller has already verified thread ownership. */
  ownershipVerified?: boolean;
}): Promise<boolean> {
  if (messages.length === 0) return true;
  const supabase = createAdminClient();

  if (!ownershipVerified) {
    const thread = await getThread({ threadId, teamId, userId });
    if (!thread) {
      logger.warn("saveThreadMessages called for non-owned thread", { threadId, teamId, userId });
      return false;
    }
  }

  const rows = messages.map((msg) => ({
    thread_id: threadId,
    role: msg.role,
    parts: msg.parts,
    attachments: msg.attachments ?? null,
    metadata: msg.metadata ?? null,
  }));

  const { error } = await supabase.from("ai_thread_messages").insert(rows);

  if (error) {
    logger.error("Failed to save AI thread messages", error, {
      threadId,
      messageCount: messages.length,
    });
    return false;
  }

  // Touch the thread's updated_at timestamp
  await supabase
    .from("ai_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);

  return true;
}

export async function loadThreadMessages({
  threadId,
  teamId,
  userId,
  limit = 200,
}: {
  threadId: string;
  teamId: string;
  userId: string;
  limit?: number;
}): Promise<AiThreadMessage[]> {
  const supabase = createAdminClient();

  // Verify thread ownership before loading messages
  const thread = await getThread({ threadId, teamId, userId });
  if (!thread) return [];

  const { data, error } = await supabase
    .from("ai_thread_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<ThreadMessageRow[]>();

  if (error) {
    logger.error("Failed to load AI thread messages", error, { threadId });
    return [];
  }
  return data.map(toThreadMessage);
}
