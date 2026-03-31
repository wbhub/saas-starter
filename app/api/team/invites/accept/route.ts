import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { withAuthedRoute } from "@/lib/http/authed-route";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { z } from "@/lib/http/request-validation";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { acceptTeamInvite } from "@/lib/team-invites/accept-invite";

const acceptInvitePayloadSchema = z.object({
  token: z.string().trim().min(10).max(256),
});

const ERROR_STATUS: Record<string, number> = {
  no_email: 400,
  not_found: 404,
  already_accepted: 409,
  expired: 410,
  email_mismatch: 403,
  team_full: 409,
  rpc_error: 500,
  unknown: 500,
};

const ERROR_MESSAGE_KEY: Record<string, string> = {
  no_email: "errors.noEmailOnAccount",
  not_found: "errors.inviteNotFound",
  already_accepted: "errors.inviteAlreadyAccepted",
  expired: "errors.inviteExpired",
  email_mismatch: "errors.inviteEmailMismatch",
  team_full: "errors.teamMemberLimitReached",
  rpc_error: "errors.unableToAcceptInvite",
  unknown: "errors.unableToAcceptInvite",
};

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiTeamInviteAccept", request);

  return withAuthedRoute({
    request,
    schema: acceptInvitePayloadSchema,
    unauthorizedMessage: t("errors.unauthorized"),
    invalidPayloadMessage: t("errors.invalidInviteToken"),
    payloadTooLargeMessage: t("errors.payloadTooLarge"),
    rateLimits: ({ request: req, userId }) => {
      const clientId = getClientRateLimitIdentifier(req);
      return [
        {
          key: `team-invite:accept:user:${userId}`,
          ...RATE_LIMITS.teamInviteAcceptByUser,
          message: t("errors.rateLimited"),
        },
        {
          key: `team-invite:accept:${clientId.keyType}:${clientId.value}`,
          ...RATE_LIMITS.teamInviteAcceptByClient,
          message: t("errors.rateLimited"),
        },
      ];
    },
    handler: async ({ user, requestId, body }) => {
      const result = await acceptTeamInvite({
        token: body.token,
        userId: user.id,
        userEmail: user.email,
        requestId,
      });

      if (!result.ok) {
        const status = ERROR_STATUS[result.errorCode] ?? 500;
        const messageKey = ERROR_MESSAGE_KEY[result.errorCode] ?? "errors.unableToAcceptInvite";
        return jsonError(t(messageKey), status);
      }

      if (result.warning === "seat_sync_failed") {
        return jsonSuccess({
          warning: t("errors.billingSyncFailedAfterAccept"),
          inviteAccepted: true,
          teamName: result.teamName,
        });
      }

      return jsonSuccess({ teamName: result.teamName });
    },
  });
}
