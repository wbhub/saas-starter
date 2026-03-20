import { afterEach, describe, expect, it } from "vitest";
import {
  getEnabledSocialAuthProviders,
  getSocialProviderOptions,
  parseAuthProvider,
  parseSupabaseProvider,
  toSupabaseOAuthProvider,
} from "./social-auth";

const GOOGLE_FLAG = "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED";
const MICROSOFT_FLAG = "NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED";

function clearFlags() {
  delete process.env[GOOGLE_FLAG];
  delete process.env[MICROSOFT_FLAG];
}

describe("social auth feature flags", () => {
  afterEach(() => {
    clearFlags();
  });

  it("returns no providers when all flags are disabled", () => {
    clearFlags();
    expect(getEnabledSocialAuthProviders()).toEqual([]);
  });

  it("returns only enabled providers", () => {
    process.env[GOOGLE_FLAG] = "true";
    process.env[MICROSOFT_FLAG] = "0";
    expect(getEnabledSocialAuthProviders()).toEqual(["google"]);

    process.env[GOOGLE_FLAG] = "false";
    process.env[MICROSOFT_FLAG] = "1";
    expect(getEnabledSocialAuthProviders()).toEqual(["microsoft"]);
  });

  it("returns both providers when both flags are enabled", () => {
    process.env[GOOGLE_FLAG] = "true";
    process.env[MICROSOFT_FLAG] = "yes";
    expect(getEnabledSocialAuthProviders()).toEqual(["google", "microsoft"]);
  });
});

describe("social auth provider helpers", () => {
  it("parses only known provider values", () => {
    expect(parseAuthProvider("google")).toBe("google");
    expect(parseAuthProvider("microsoft")).toBe("microsoft");
    expect(parseAuthProvider("github")).toBeNull();
    expect(parseAuthProvider(null)).toBeNull();
  });

  it("maps microsoft to supabase azure provider", () => {
    expect(toSupabaseOAuthProvider("google")).toBe("google");
    expect(toSupabaseOAuthProvider("microsoft")).toBe("azure");
  });

  it("parses supabase provider values", () => {
    expect(parseSupabaseProvider("google")).toBe("google");
    expect(parseSupabaseProvider("azure")).toBe("microsoft");
    expect(parseSupabaseProvider("microsoft")).toBe("microsoft");
    expect(parseSupabaseProvider("github")).toBeNull();
    expect(parseSupabaseProvider(null)).toBeNull();
  });

  it("marks only the matching provider as last used", () => {
    expect(getSocialProviderOptions(["google", "microsoft"], "microsoft")).toEqual([
      { provider: "google", label: "Google", isLastUsed: false },
      { provider: "microsoft", label: "Microsoft", isLastUsed: true },
    ]);
  });
});
