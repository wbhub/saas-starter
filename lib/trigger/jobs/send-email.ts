import { task } from "@trigger.dev/sdk/v3";
import { sendResendEmail } from "@/lib/resend/server";
import {
  TRIGGER_TASK_IDS,
  type SendEmailPayload,
} from "@/lib/trigger/jobs/payloads";

export const sendEmailTask = task({
  id: TRIGGER_TASK_IDS.sendEmail,
  run: async (payload: SendEmailPayload) => {
    await sendResendEmail(payload);
    return { ok: true as const };
  },
});
