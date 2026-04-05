import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { isSupportedFileMimeType, resolveAttachmentMimeType } from "@/lib/ai/attachments";
import { isAiProviderName, type AiProviderName } from "@/lib/ai/provider-name";
import { env } from "@/lib/env";
import { withTeamRoute } from "@/lib/http/team-route";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { aiProviderName, isAiProviderConfiguredFor } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";

const OPENAI_FILES_API_URL = "https://api.openai.com/v1/files";
const OPENAI_FILE_PURPOSE = "user_data";
const ANTHROPIC_FILES_API_URL = "https://api.anthropic.com/v1/files";
const ANTHROPIC_API_VERSION = "2023-06-01";
const ANTHROPIC_FILES_API_BETA = "files-api-2025-04-14";
const GOOGLE_FILES_UPLOAD_API_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const MAX_AI_FILE_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_AI_MULTIPART_BODY_BYTES = MAX_AI_FILE_UPLOAD_BYTES + 256 * 1024;

type UploadedAttachmentResult =
  | {
      fileId: string;
      name: string;
      mimeType: string;
    }
  | {
      url: string;
      name: string;
      mimeType: string;
    };

function getProviderApiKey(providerName: AiProviderName) {
  const genericKey = (env.AI_PROVIDER_API_KEY || "").trim();
  if (genericKey && providerName === aiProviderName) {
    return genericKey;
  }

  if (providerName === "anthropic") {
    return (env.ANTHROPIC_API_KEY || "").trim();
  }

  if (providerName === "google") {
    return (env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
  }

  return (env.OPENAI_API_KEY || "").trim();
}

function toUpstreamErrorResponse(
  status: number,
  t: Awaited<ReturnType<typeof getRouteTranslator>>,
) {
  if (status === 429) {
    return jsonError(t("errors.upstreamRateLimited"), 429);
  }

  if (status >= 400 && status < 500) {
    return jsonError(t("errors.upstreamBadRequest"), 400);
  }

  return jsonError(t("errors.unavailable"), 503);
}

async function uploadToOpenAi(file: File, apiKey: string, signal: AbortSignal) {
  const upstreamBody = new FormData();
  upstreamBody.set("purpose", OPENAI_FILE_PURPOSE);
  upstreamBody.set("file", file, file.name);

  return fetch(OPENAI_FILES_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: upstreamBody,
    signal,
  });
}

async function uploadToAnthropic(file: File, apiKey: string, signal: AbortSignal) {
  const upstreamBody = new FormData();
  upstreamBody.set("file", file, file.name);

  return fetch(ANTHROPIC_FILES_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "anthropic-beta": ANTHROPIC_FILES_API_BETA,
    },
    body: upstreamBody,
    signal,
  });
}

async function startGoogleUpload(
  file: File,
  mimeType: string,
  apiKey: string,
  signal: AbortSignal,
) {
  return fetch(GOOGLE_FILES_UPLOAD_API_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: {
        display_name: file.name,
      },
    }),
    signal,
  });
}

async function finalizeGoogleUpload(uploadUrl: string, file: File, signal: AbortSignal) {
  return fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": String(file.size),
    },
    body: file,
    signal,
  });
}

function extractFileId(payload: unknown) {
  const fileId = (payload as { id?: unknown } | null)?.id;
  return typeof fileId === "string" && fileId.length > 0 ? fileId : null;
}

function extractGoogleFileUrl(payload: unknown) {
  const nestedUri = (payload as { file?: { uri?: unknown } } | null)?.file?.uri;
  if (typeof nestedUri === "string" && nestedUri.length > 0) {
    return nestedUri;
  }

  const topLevelUri = (payload as { uri?: unknown } | null)?.uri;
  if (typeof topLevelUri === "string" && topLevelUri.length > 0) {
    return topLevelUri;
  }

  return null;
}

function logUploadFailure({
  message,
  error,
  userId,
  teamId,
  fileName,
  mimeType,
  status,
  body,
}: {
  message: string;
  error: Error;
  userId: string;
  teamId: string;
  fileName: string;
  mimeType: string;
  status?: number;
  body?: string;
}) {
  logger.error(message, error, {
    userId,
    teamId,
    fileName,
    mimeType,
    ...(typeof status === "number" ? { status } : {}),
    ...(body ? { body: body.slice(0, 1_000) } : {}),
  });
}

async function parseMultipartFormDataWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<
  { ok: true; formData: FormData } | { ok: false; reason: "payload_too_large" | "invalid_payload" }
> {
  if (!request.body) {
    return { ok: false, reason: "invalid_payload" };
  }

  const reader = request.body.getReader();
  const chunks: BlobPart[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "payload_too_large" };
      }

      chunks.push(new Uint8Array(value));
    }
  } catch {
    return { ok: false, reason: "invalid_payload" };
  } finally {
    reader.releaseLock();
  }

  try {
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const formData = await new Response(new Blob(chunks), { headers }).formData();
    return { ok: true, formData };
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
}

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiAiChat", request);

  return withTeamRoute({
    request,
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `ai-file-upload:${teamId}:${userId}`,
        ...RATE_LIMITS.aiChatByUser,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ user, teamContext }) => {
      const contentLengthHeader = request.headers.get("content-length");
      const contentLength = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN;
      if (Number.isFinite(contentLength) && contentLength > MAX_AI_MULTIPART_BODY_BYTES) {
        return jsonError(t("errors.payloadTooLarge"), 413);
      }

      const parsedFormData = await parseMultipartFormDataWithinLimit(
        request,
        MAX_AI_MULTIPART_BODY_BYTES,
      );
      if (!parsedFormData.ok) {
        return parsedFormData.reason === "payload_too_large"
          ? jsonError(t("errors.payloadTooLarge"), 413)
          : jsonError(t("errors.invalidPayload"), 400);
      }

      const file = parsedFormData.formData.get("file");
      const providerField = parsedFormData.formData.get("provider");

      if (!(file instanceof File)) {
        return jsonError(t("errors.invalidPayload"), 400);
      }
      if (providerField !== null && typeof providerField !== "string") {
        return jsonError(t("errors.invalidPayload"), 400);
      }

      const providerName = (providerField?.trim() || aiProviderName) as string;
      if (!isAiProviderName(providerName)) {
        return jsonError(t("errors.invalidPayload"), 400);
      }
      if (!isAiProviderConfiguredFor(providerName)) {
        return jsonError(t("errors.unavailable"), 503);
      }

      if (file.size > MAX_AI_FILE_UPLOAD_BYTES) {
        return jsonError(t("errors.payloadTooLarge"), 413);
      }

      const mimeType = resolveAttachmentMimeType({
        mimeType: file.type,
        fileName: file.name,
      });

      if (!isSupportedFileMimeType(mimeType, providerName)) {
        return jsonError(t("errors.unsupportedAttachmentType"), 400);
      }

      const apiKey = getProviderApiKey(providerName);
      if (!apiKey) {
        return jsonError(t("errors.unavailable"), 503);
      }

      let result: UploadedAttachmentResult;

      try {
        if (providerName === "openai") {
          const upstreamResponse = await uploadToOpenAi(file, apiKey, request.signal);
          if (!upstreamResponse.ok) {
            const upstreamErrorText = await upstreamResponse.text().catch(() => "");
            logUploadFailure({
              message: "OpenAI rejected AI attachment upload",
              error: new Error("upstream_upload_failed"),
              userId: user.id,
              teamId: teamContext.teamId,
              fileName: file.name,
              mimeType,
              status: upstreamResponse.status,
              body: upstreamErrorText,
            });
            return toUpstreamErrorResponse(upstreamResponse.status, t);
          }

          const payload = await upstreamResponse.json().catch(() => null);
          const fileId = extractFileId(payload);
          if (!fileId) {
            logUploadFailure({
              message: "OpenAI attachment upload returned an invalid response payload",
              error: new Error("invalid_upload_payload"),
              userId: user.id,
              teamId: teamContext.teamId,
              fileName: file.name,
              mimeType,
            });
            return jsonError(t("errors.unavailable"), 503);
          }

          result = {
            fileId,
            name: file.name,
            mimeType,
          };
        } else if (providerName === "anthropic") {
          const upstreamResponse = await uploadToAnthropic(file, apiKey, request.signal);
          if (!upstreamResponse.ok) {
            const upstreamErrorText = await upstreamResponse.text().catch(() => "");
            logUploadFailure({
              message: "Anthropic rejected AI attachment upload",
              error: new Error("upstream_upload_failed"),
              userId: user.id,
              teamId: teamContext.teamId,
              fileName: file.name,
              mimeType,
              status: upstreamResponse.status,
              body: upstreamErrorText,
            });
            return toUpstreamErrorResponse(upstreamResponse.status, t);
          }

          const payload = await upstreamResponse.json().catch(() => null);
          const fileId = extractFileId(payload);
          if (!fileId) {
            logUploadFailure({
              message: "Anthropic attachment upload returned an invalid response payload",
              error: new Error("invalid_upload_payload"),
              userId: user.id,
              teamId: teamContext.teamId,
              fileName: file.name,
              mimeType,
            });
            return jsonError(t("errors.unavailable"), 503);
          }

          result = {
            fileId,
            name: file.name,
            mimeType,
          };
        } else {
          const startResponse = await startGoogleUpload(file, mimeType, apiKey, request.signal);
          if (!startResponse.ok) {
            const upstreamErrorText = await startResponse.text().catch(() => "");
            logUploadFailure({
              message: "Google rejected AI attachment upload session creation",
              error: new Error("upstream_upload_failed"),
              userId: user.id,
              teamId: teamContext.teamId,
              fileName: file.name,
              mimeType,
              status: startResponse.status,
              body: upstreamErrorText,
            });
            return toUpstreamErrorResponse(startResponse.status, t);
          }

          const uploadUrl = startResponse.headers.get("x-goog-upload-url");
          if (!uploadUrl) {
            logUploadFailure({
              message: "Google attachment upload did not return a resumable upload URL",
              error: new Error("missing_upload_url"),
              userId: user.id,
              teamId: teamContext.teamId,
              fileName: file.name,
              mimeType,
            });
            return jsonError(t("errors.unavailable"), 503);
          }

          const finalizeResponse = await finalizeGoogleUpload(uploadUrl, file, request.signal);
          if (!finalizeResponse.ok) {
            const upstreamErrorText = await finalizeResponse.text().catch(() => "");
            logUploadFailure({
              message: "Google rejected AI attachment upload finalization",
              error: new Error("upstream_upload_failed"),
              userId: user.id,
              teamId: teamContext.teamId,
              fileName: file.name,
              mimeType,
              status: finalizeResponse.status,
              body: upstreamErrorText,
            });
            return toUpstreamErrorResponse(finalizeResponse.status, t);
          }

          const payload = await finalizeResponse.json().catch(() => null);
          const url = extractGoogleFileUrl(payload);
          if (!url) {
            logUploadFailure({
              message: "Google attachment upload returned an invalid response payload",
              error: new Error("invalid_upload_payload"),
              userId: user.id,
              teamId: teamContext.teamId,
              fileName: file.name,
              mimeType,
            });
            return jsonError(t("errors.unavailable"), 503);
          }

          result = {
            url,
            name: file.name,
            mimeType,
          };
        }
      } catch (error) {
        logUploadFailure({
          message: `Failed to upload AI attachment to ${providerName}`,
          error: error instanceof Error ? error : new Error("upload_failed"),
          userId: user.id,
          teamId: teamContext.teamId,
          fileName: file.name,
          mimeType,
        });
        return jsonError(t("errors.unavailable"), 503);
      }

      return jsonSuccess(result);
    },
  });
}
