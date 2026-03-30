/**
 * Browser-only: decode, downscale, and re-encode images for AI chat attachments.
 * Produces Files whose data URLs stay under the configured character budget.
 * Do not import from API routes or Server Components.
 */

import { resolveAttachmentMimeType } from "./attachments";

export const MAX_CHAT_IMAGE_RAW_BYTES = 25 * 1024 * 1024;
export const MAX_CHAT_IMAGE_DECODED_PIXELS = 25_000_000;
export const CHAT_IMAGE_COMPRESS_LONG_EDGE_PX = 2048;
export const MAX_CHAT_IMAGE_RAW_MB = 25;

const MIN_LONG_EDGE_PX = 256;
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.28] as const;

export type ChatImageCompressionErrorCode =
  | "raw_too_large"
  | "pixels_too_large"
  | "compression_failed"
  | "decode_failed";

export class ChatImageCompressionError extends Error {
  readonly code: ChatImageCompressionErrorCode;

  constructor(code: ChatImageCompressionErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.name = "ChatImageCompressionError";
    this.code = code;
  }
}

/** Fit image inside a square of `maxLongEdgePx` on the long edge; preserve aspect ratio. */
export function computeScaledDimensions(
  maxLongEdgePx: number,
  width: number,
  height: number,
): { width: number; height: number } {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const longEdge = Math.max(w, h);
  if (longEdge <= maxLongEdgePx) {
    return { width: w, height: h };
  }
  const scale = maxLongEdgePx / longEdge;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

let webpEncodeSupported: boolean | null = null;

function isWebpEncodeSupported(): boolean {
  if (webpEncodeSupported !== null) {
    return webpEncodeSupported;
  }
  if (typeof document === "undefined") {
    webpEncodeSupported = false;
    return false;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const url = canvas.toDataURL("image/webp", 0.8);
  webpEncodeSupported = url.startsWith("data:image/webp");
  return webpEncodeSupported;
}

async function decodeImageBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    return await new Promise<ImageBitmap>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          void createImageBitmap(img).then(
            (bitmap) => {
              URL.revokeObjectURL(objectUrl);
              resolve(bitmap);
            },
            (cause) => {
              URL.revokeObjectURL(objectUrl);
              reject(new ChatImageCompressionError("decode_failed", { cause }));
            },
          );
        } catch (cause) {
          URL.revokeObjectURL(objectUrl);
          reject(new ChatImageCompressionError("decode_failed", { cause }));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new ChatImageCompressionError("decode_failed"));
      };
      img.src = objectUrl;
    });
  }
}

function withImageExtension(originalName: string, mime: string): string {
  const trimmed = originalName.trim() || "image";
  const base = trimmed.replace(/\.[^./\\]+$/, "");
  const safeBase = base.length > 0 ? base : "image";
  if (mime === "image/webp") {
    return `${safeBase}.webp`;
  }
  if (mime === "image/jpeg") {
    return `${safeBase}.jpg`;
  }
  return `${safeBase}.png`;
}

function dataUrlToFile(dataUrl: string, originalName: string, mime: string): File {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    throw new ChatImageCompressionError("compression_failed");
  }
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw new ChatImageCompressionError("compression_failed");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const mimeMatch = /^data:([^;,]+)/.exec(header);
  const resolvedMime = mimeMatch?.[1]?.trim() || mime;
  return new File([bytes], withImageExtension(originalName, mime), { type: resolvedMime });
}

function tryEncodeCanvas(
  canvas: HTMLCanvasElement,
  maxDataUrlChars: number,
  mime: string,
  useQuality: boolean,
): string | null {
  if (!useQuality) {
    const dataUrl = canvas.toDataURL(mime);
    if (dataUrl.length > 0 && dataUrl.length <= maxDataUrlChars) {
      return dataUrl;
    }
    return null;
  }
  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL(mime, quality);
    if (!dataUrl || dataUrl.length < 32) {
      continue;
    }
    if (dataUrl.length <= maxDataUrlChars) {
      return dataUrl;
    }
  }
  return null;
}

/**
 * Returns a new File (WebP, JPEG, or PNG) that should produce a data URL under `maxDataUrlChars`.
 * GIFs become a single static frame in the output format.
 */
export async function compressImageFileForChat(
  file: File,
  options: {
    maxDataUrlChars: number;
    maxLongEdgePx: number;
  },
): Promise<File> {
  const { maxDataUrlChars, maxLongEdgePx } = options;

  if (file.size > MAX_CHAT_IMAGE_RAW_BYTES) {
    throw new ChatImageCompressionError("raw_too_large");
  }

  if (typeof document === "undefined") {
    throw new ChatImageCompressionError("decode_failed");
  }

  const bitmap = await decodeImageBitmap(file);
  try {
    const bw = bitmap.width;
    const bh = bitmap.height;
    if (bw <= 0 || bh <= 0) {
      throw new ChatImageCompressionError("decode_failed");
    }
    if (bw * bh > MAX_CHAT_IMAGE_DECODED_PIXELS) {
      throw new ChatImageCompressionError("pixels_too_large");
    }

    const inputMime = resolveAttachmentMimeType({
      mimeType: file.type,
      fileName: file.name,
    }).toLowerCase();
    const prefersAlpha =
      inputMime === "image/png" || inputMime === "image/gif" || inputMime === "image/webp";

    const canvas = document.createElement("canvas");

    const webpOk = isWebpEncodeSupported();
    const mimeOrder: string[] = prefersAlpha
      ? webpOk
        ? ["image/webp", "image/png"]
        : ["image/png", "image/jpeg"]
      : webpOk
        ? ["image/webp", "image/jpeg"]
        : ["image/jpeg"];

    let longEdgeLimit = Math.min(maxLongEdgePx, Math.max(bw, bh));

    while (longEdgeLimit >= MIN_LONG_EDGE_PX) {
      const { width: cw, height: ch } = computeScaledDimensions(longEdgeLimit, bw, bh);
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new ChatImageCompressionError("compression_failed");
      }
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(bitmap, 0, 0, cw, ch);

      for (const mime of mimeOrder) {
        const useQuality = mime === "image/webp" || mime === "image/jpeg";
        const dataUrl = tryEncodeCanvas(canvas, maxDataUrlChars, mime, useQuality);
        if (dataUrl) {
          return dataUrlToFile(dataUrl, file.name, mime);
        }
      }

      longEdgeLimit = Math.floor(longEdgeLimit * 0.85);
    }

    throw new ChatImageCompressionError("compression_failed");
  } finally {
    bitmap.close();
  }
}
