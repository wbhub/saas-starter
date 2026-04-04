const INVITE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteBatchOutcome = {
  totalCount: number;
  deliveredCount: number;
  createdWithoutEmailCount: number;
  failedCount: number;
};

export type InviteBannerDescriptor = {
  kind: "success" | "error" | "partial";
  messageKey: string;
  values?: Record<string, number>;
};

export function normalizeInviteEmailInput(raw: string) {
  return raw.trim().toLowerCase();
}

export function isInviteEmailInputValid(email: string) {
  return INVITE_EMAIL_RE.test(email);
}

export function parseInviteEmailPaste({
  existingEmails,
  text,
}: {
  existingEmails: string[];
  text: string;
}) {
  const seen = new Set(existingEmails);
  const emailsToAdd: string[] = [];
  let invalidEmail: string | null = null;
  let duplicateEmail: string | null = null;

  for (const rawPart of text.split(/[,;\s\n]+/)) {
    const email = normalizeInviteEmailInput(rawPart);
    if (!email) {
      continue;
    }
    if (!isInviteEmailInputValid(email)) {
      invalidEmail ??= email;
      continue;
    }
    if (seen.has(email)) {
      duplicateEmail ??= email;
      continue;
    }

    seen.add(email);
    emailsToAdd.push(email);
  }

  return { emailsToAdd, invalidEmail, duplicateEmail };
}

export function describeInviteBatchOutcome({
  totalCount,
  deliveredCount,
  createdWithoutEmailCount,
  failedCount,
}: InviteBatchOutcome): InviteBannerDescriptor {
  if (totalCount <= 0) {
    throw new Error("Invite batch outcome requires at least one invite.");
  }

  if (failedCount === 0) {
    if (createdWithoutEmailCount === 0) {
      return totalCount === 1
        ? { kind: "success", messageKey: "feedback.inviteEmailSent" }
        : {
            kind: "success",
            messageKey: "feedback.bulkInvitesSent",
            values: { count: totalCount },
          };
    }

    if (totalCount === 1) {
      return { kind: "success", messageKey: "feedback.inviteCreatedEmailFailed" };
    }

    if (deliveredCount === 0) {
      return {
        kind: "success",
        messageKey: "feedback.bulkInvitesCreatedEmailFailed",
        values: { count: totalCount },
      };
    }

    return {
      kind: "success",
      messageKey: "feedback.bulkInvitesPartialEmailDelivery",
      values: {
        sentCount: deliveredCount,
        totalCount,
        createdCount: createdWithoutEmailCount,
      },
    };
  }

  if (deliveredCount === 0 && createdWithoutEmailCount === 0) {
    return totalCount === 1
      ? { kind: "error", messageKey: "errors.sendInvite" }
      : { kind: "error", messageKey: "feedback.bulkInvitesFailed" };
  }

  if (createdWithoutEmailCount === 0) {
    return {
      kind: "partial",
      messageKey: "feedback.bulkInvitesPartial",
      values: {
        successCount: deliveredCount,
        totalCount,
        failedCount,
      },
    };
  }

  return {
    kind: "partial",
    messageKey: "feedback.bulkInvitesMixedResults",
    values: {
      sentCount: deliveredCount,
      totalCount,
      createdCount: createdWithoutEmailCount,
      failedCount,
    },
  };
}
