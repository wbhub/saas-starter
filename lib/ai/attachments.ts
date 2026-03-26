import type { AiProviderName } from "@/lib/ai/provider-name";

export type AttachmentProviderName = AiProviderName;

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
