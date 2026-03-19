import { afterEach, describe, expect, it } from "vitest";
import { getClientIp } from "./client-ip";

const ORIGINAL_TRUST_PROXY_HEADERS = process.env.TRUST_PROXY_HEADERS;

afterEach(() => {
  if (ORIGINAL_TRUST_PROXY_HEADERS === undefined) {
    delete process.env.TRUST_PROXY_HEADERS;
  } else {
    process.env.TRUST_PROXY_HEADERS = ORIGINAL_TRUST_PROXY_HEADERS;
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
});

