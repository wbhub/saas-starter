import { task } from "@trigger.dev/sdk/v3";
import { processDueAiBudgetFinalizeRetries } from "@/lib/ai/budget-finalize-retries";
import {
  TRIGGER_TASK_IDS,
  type AiBudgetFinalizeRetriesPayload,
} from "@/lib/trigger/jobs/payloads";

export const aiBudgetFinalizeRetriesTask = task({
  id: TRIGGER_TASK_IDS.aiBudgetFinalizeRetries,
  run: async (payload: AiBudgetFinalizeRetriesPayload) => {
    return processDueAiBudgetFinalizeRetries(payload.limit);
  },
});
