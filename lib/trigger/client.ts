import { logger } from "@/lib/logger";
import { isTriggerConfigured } from "@/lib/trigger/config";

type TriggerTasksApi = {
  trigger: (taskId: string, payload: unknown) => Promise<unknown>;
};

let tasksClientPromise: Promise<TriggerTasksApi | null> | null = null;

function asTriggerTasksApi(value: unknown): TriggerTasksApi | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeTrigger = (value as { trigger?: unknown }).trigger;
  if (typeof maybeTrigger !== "function") {
    return null;
  }
  const trigger = maybeTrigger.bind(value) as TriggerTasksApi["trigger"];

  return {
    trigger,
  };
}

async function loadTriggerTasksClient() {
  try {
    const sdk = await import("@trigger.dev/sdk/v3");
    return asTriggerTasksApi(sdk.tasks);
  } catch (error) {
    logger.error("Failed to load Trigger.dev SDK", error);
    return null;
  }
}

export async function getTriggerTasksClient() {
  if (!isTriggerConfigured()) {
    return null;
  }

  if (!tasksClientPromise) {
    tasksClientPromise = loadTriggerTasksClient();
  }

  return tasksClientPromise;
}

export async function triggerTaskIfConfigured(taskId: string, payload: unknown) {
  const client = await getTriggerTasksClient();
  if (!client) {
    return null;
  }

  try {
    return await client.trigger(taskId, payload);
  } catch (error) {
    logger.error("Failed to trigger Trigger.dev task", error, { taskId });
    return null;
  }
}
