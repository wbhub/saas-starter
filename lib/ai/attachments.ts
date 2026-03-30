import type { AiProviderName } from "@/lib/ai/provider-name";

export type AttachmentProviderName = AiProviderName;
export type ProviderFileIdAttachmentProviderName = Extract<
  AttachmentProviderName,
  "openai" | "anthropic"
>;

export const SUPPORTED_IMAGE_MIME_TYPE_LIST = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const SUPPORTED_FILE_MIME_TYPE_LIST_BY_PROVIDER: Record<AttachmentProviderName, readonly string[]> =
  {
    openai: ["application/pdf"],
    anthropic: ["application/pdf", "text/plain"],
    google: ["application/pdf", "text/plain", "text/csv"],
  };

export const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>(SUPPORTED_IMAGE_MIME_TYPE_LIST);

const SUPPORTED_FILE_MIME_TYPES_BY_PROVIDER: Record<AttachmentProviderName, ReadonlySet<string>> = {
  openai: new Set(SUPPORTED_FILE_MIME_TYPE_LIST_BY_PROVIDER.openai),
  anthropic: new Set(SUPPORTED_FILE_MIME_TYPE_LIST_BY_PROVIDER.anthropic),
  google: new Set(SUPPORTED_FILE_MIME_TYPE_LIST_BY_PROVIDER.google),
};

export function getSupportedFileMimeTypes(providerName: AttachmentProviderName) {
  return SUPPORTED_FILE_MIME_TYPES_BY_PROVIDER[providerName];
}

export function isSupportedFileMimeType(mimeType: string, providerName: AttachmentProviderName) {
  return getSupportedFileMimeTypes(providerName).has(mimeType);
}

export function providerSupportsFileIds(
  providerName: AttachmentProviderName,
): providerName is ProviderFileIdAttachmentProviderName {
  return providerName === "openai" || providerName === "anthropic";
}

export function inferMimeTypeFromFilename(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  if (!extension) {
    return "";
  }
  return EXTENSION_MIME_MAP[extension] ?? "";
}

export function resolveAttachmentMimeType({
  mimeType,
  fileName,
}: {
  mimeType?: string | null;
  fileName: string;
}) {
  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? "";
  if (normalizedMimeType.length > 0) {
    return normalizedMimeType;
  }
  return inferMimeTypeFromFilename(fileName);
}

export function getProviderFileId(
  providerName: AttachmentProviderName,
  providerMetadata: unknown,
) {
  if (!providerMetadata || typeof providerMetadata !== "object") {
    return undefined;
  }

  const providerEntry = (providerMetadata as Record<string, unknown>)[providerName];
  if (!providerEntry || typeof providerEntry !== "object") {
    return undefined;
  }

  const fileId = (providerEntry as { fileId?: unknown }).fileId;
  return typeof fileId === "string" && fileId.trim().length > 0 ? fileId : undefined;
}

export function toProviderFilePlaceholderUrl(
  providerName: ProviderFileIdAttachmentProviderName,
  fileId: string,
) {
  return `${providerName}-file://${fileId}`;
}

export function getSupportedAttachmentAccept(providerName: AttachmentProviderName) {
  return [
    ...SUPPORTED_IMAGE_MIME_TYPE_LIST,
    ...SUPPORTED_FILE_MIME_TYPE_LIST_BY_PROVIDER[providerName],
  ].join(",");
}

export const EXTENSION_MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
};
