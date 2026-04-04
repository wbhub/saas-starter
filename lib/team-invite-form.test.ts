import { describe, expect, it } from "vitest";
import { describeInviteBatchOutcome, parseInviteEmailPaste } from "./team-invite-form";

describe("team invite form helpers", () => {
  it("deduplicates pasted emails against both existing chips and the same paste", () => {
    expect(
      parseInviteEmailPaste({
        existingEmails: ["alpha@example.com"],
        text: "alpha@example.com, beta@example.com beta@example.com",
      }),
    ).toEqual({
      emailsToAdd: ["beta@example.com"],
      invalidEmail: null,
      duplicateEmail: "alpha@example.com",
    });
  });

  it("keeps the single-invite email delivery failure warning", () => {
    expect(
      describeInviteBatchOutcome({
        totalCount: 1,
        deliveredCount: 0,
        createdWithoutEmailCount: 1,
        failedCount: 0,
      }),
    ).toEqual({
      kind: "success",
      messageKey: "feedback.inviteCreatedEmailFailed",
    });
  });

  it("distinguishes created-without-email from request failures in batches", () => {
    expect(
      describeInviteBatchOutcome({
        totalCount: 4,
        deliveredCount: 1,
        createdWithoutEmailCount: 2,
        failedCount: 1,
      }),
    ).toEqual({
      kind: "partial",
      messageKey: "feedback.bulkInvitesMixedResults",
      values: {
        sentCount: 1,
        totalCount: 4,
        createdCount: 2,
        failedCount: 1,
      },
    });
  });
});
