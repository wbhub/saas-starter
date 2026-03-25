import { describe, expect, it } from "vitest";
import { resolveRequestLocale } from "./locale";

describe("resolveRequestLocale", () => {
  it("prefers a supported locale cookie", () => {
    const request = new Request("https://example.com", {
      headers: {
        cookie: "NEXT_LOCALE=ko",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });

    expect(resolveRequestLocale(request)).toBe("ko");
  });

  it("maps regional Accept-Language headers to the base locale", () => {
    const request = new Request("https://example.com", {
      headers: {
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    expect(resolveRequestLocale(request)).toBe("ko");
  });

  it("supports Japanese locale detection from Accept-Language", () => {
    const request = new Request("https://example.com", {
      headers: {
        "accept-language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    expect(resolveRequestLocale(request)).toBe("ja");
  });

  it("falls back to the default locale when no supported locale is present", () => {
    const request = new Request("https://example.com", {
      headers: {
        "accept-language": "de-DE,de;q=0.9",
      },
    });

    expect(resolveRequestLocale(request)).toBe("en");
  });
});
