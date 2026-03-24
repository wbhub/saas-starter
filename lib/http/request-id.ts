import { NextResponse } from "next/server";

export const REQUEST_ID_HEADER = "x-request-id";

export function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateRequestId(request: Request) {
  const existing = request.headers.get(REQUEST_ID_HEADER)?.trim();
  if (existing) {
    return existing;
  }
  return createRequestId();
}

export function withRequestId<TResponse extends Response>(
  response: TResponse,
  requestId: string,
): TResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export function jsonWithRequestId(requestId: string, body: unknown, init?: ResponseInit) {
  return withRequestId(NextResponse.json(body, init), requestId);
}
