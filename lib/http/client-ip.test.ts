import { afterEach, describe, expect, it } from "vitest";
import { getClientIp, getClientRateLimitIdentifier } from "./client-ip";

const ORIGINAL_TRUST_PROXY_HEADERS = process.env.TRUST_PROXY_HEADERS;
const ORIGINAL_TRUSTED_PROXY_HEADER_NAMES = process.env.TRUSTED_PROXY_HEADER_NAMES;

afterEach(() => {
  if (ORIGINAL_TRUST_PROXY_HEADERS === undefined) {
    delete process.env.TRUST_PROXY_HEADERS;
  } else {
    process.env.TRUST_PROXY_HEADERS = ORIGINAL_TRUST_PROXY_HEADERS;
  }
  if (ORIGINAL_TRUSTED_PROXY_HEADER_NAMES === undefined) {
    delete process.env.TRUSTED_PROXY_HEADER_NAMES;
  } else {
    process.env.TRUSTED_PROXY_HEADER_NAMES = ORIGINAL_TRUSTED_PROXY_HEADER_NAMES;
  }
});

describe("getClientIp", () => {
  it("returns null when proxy headers are not trusted", () => {
    delete process.env.TRUST_PROXY_HEADERS;
    const request = new Request("https://example.com", {
      headers: {
        "x-vercel-forwarded-for": "198.51.100.10",
        "user-agent": "test-agent",
      },
    });

    const ip = getClientIp(request);
    expect(ip).toBeNull();
  });

  it("uses trusted proxy headers when explicitly enabled", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const request = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "198.51.100.10",
      },
    });

    expect(getClientIp(request)).toBe("198.51.100.10");
  });

  it("uses the first valid IP from x-forwarded-for chains", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const request = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "unknown, 203.0.113.15, 198.51.100.10",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.15");
  });

  it("supports custom trusted proxy header names", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    process.env.TRUSTED_PROXY_HEADER_NAMES = "x-custom-client-ip, x-fallback-ip";
    const request = new Request("https://example.com", {
      headers: {
        "x-custom-client-ip": "2001:db8::1",
        "x-forwarded-for": "198.51.100.10",
      },
    });

    expect(getClientIp(request)).toBe("2001:db8::1");
  });

  it("falls back to default trusted headers when configured header list is empty", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    process.env.TRUSTED_PROXY_HEADER_NAMES = " ,  ";
    const request = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "198.51.100.25",
      },
    });

    expect(getClientIp(request)).toBe("198.51.100.25");
  });

  it("returns null when trusted headers are enabled but no valid IP exists", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const request = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "not-an-ip, still-not-an-ip",
      },
    });

    expect(getClientIp(request)).toBeNull();
  });
});

describe("getClientRateLimitIdentifier", () => {
  it("prefers a stable csrf cookie when trusted proxy headers are disabled", () => {
    delete process.env.TRUST_PROXY_HEADERS;
    const request = new Request("https://example.com", {
      headers: {
        cookie: "csrf_token=abcdefghijklmnopqrstuvwxyz012345; theme=dark",
        "user-agent": "Mozilla/5.0",
      },
    });

    expect(getClientRateLimitIdentifier(request)).toEqual({
      keyType: "cookie",
      value: "abcdefghijklmnopqrstuvwxyz012345",
    });
  });

  it("returns fingerprint identifier when trusted proxy headers are disabled", () => {
    delete process.env.TRUST_PROXY_HEADERS;
    const request = new Request("https://example.com", {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": '"Chromium";v="123"',
        "sec-ch-ua-platform": '"macOS"',
      },
    });

    expect(getClientRateLimitIdentifier(request)).toEqual({
      keyType: "fingerprint",
      value: "mozilla:5:0:en:us:en:q:0:9:chromium:v:123:macos",
    });
  });

  it("returns ip identifier when trusted proxy headers are enabled", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const request = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "198.51.100.10",
      },
    });

    expect(getClientRateLimitIdentifier(request)).toEqual({
      keyType: "ip",
      value: "198.51.100.10",
    });
  });

  it("falls back to fingerprint when trusted proxy headers are enabled but missing", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const request = new Request("https://example.com", {
      headers: {
        "user-agent": "BrowserA",
      },
    });

    expect(getClientRateLimitIdentifier(request)).toEqual({
      keyType: "fingerprint",
      value: expect.any(String),
    });
  });

  it("normalizes unknown fingerprints when identifying headers are missing", () => {
    delete process.env.TRUST_PROXY_HEADERS;
    const request = new Request("https://example.com");

    expect(getClientRateLimitIdentifier(request)).toEqual({
      keyType: "fingerprint",
      value: "unknown:unknown:unknown:unknown",
    });
  });

  it("truncates long fingerprint components to stable length", () => {
    delete process.env.TRUST_PROXY_HEADERS;
    const veryLong = "X".repeat(600);
    const request = new Request("https://example.com", {
      headers: {
        "user-agent": veryLong,
        "accept-language": veryLong,
        "sec-ch-ua": veryLong,
        "sec-ch-ua-platform": veryLong,
      },
    });

    const result = getClientRateLimitIdentifier(request);
    expect(result.keyType).toBe("fingerprint");
    expect(result.value.length).toBeLessThanOrEqual(160);
  });
});
