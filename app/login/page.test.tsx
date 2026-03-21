import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GOOGLE_FLAG = "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED";
const MICROSOFT_FLAG = "NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED";

function clearSocialFlags() {
  delete process.env[GOOGLE_FLAG];
  delete process.env[MICROSOFT_FLAG];
}

describe("Login page social auth config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearSocialFlags();
    vi.doMock("next-intl/server", () => ({
      getTranslations: vi.fn().mockResolvedValue((key: string) => key),
    }));
  });

  afterEach(() => {
    clearSocialFlags();
  });

  it("passes enabled providers and last-used provider to auth form", async () => {
    process.env[GOOGLE_FLAG] = "true";
    process.env[MICROSOFT_FLAG] = "true";

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null } }),
        },
      }),
    }));
    vi.doMock("next/headers", () => ({
      cookies: async () => ({
        get: (name: string) =>
          name === "auth_last_provider" ? { value: "microsoft" } : undefined,
      }),
    }));
    vi.doMock("@/components/auth-form", () => ({
      AuthForm: ({
        socialProviders,
        lastUsedProvider,
      }: {
        socialProviders?: string[];
        lastUsedProvider?: string | null;
      }) => (
        <div
          data-testid="auth-form"
          data-social={(socialProviders ?? []).join(",")}
          data-last-used={lastUsedProvider ?? ""}
        />
      ),
    }));
    vi.doMock("@/components/theme-toggle", () => ({
      ThemeToggle: () => <div data-testid="theme-toggle" />,
    }));
    vi.doMock("@/components/site-footer", () => ({
      SiteFooter: () => <footer data-testid="site-footer" />,
    }));
    vi.doMock("@/components/site-header", () => ({
      SiteHeader: () => <header data-testid="site-header" />,
    }));

    const LoginPage = (await import("./page")).default;
    const html = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('data-social="google,microsoft"');
    expect(html).toContain('data-last-used="microsoft"');
  });

  it("passes no social providers when both flags are disabled", async () => {
    process.env[GOOGLE_FLAG] = "false";
    process.env[MICROSOFT_FLAG] = "false";

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null } }),
        },
      }),
    }));
    vi.doMock("next/headers", () => ({
      cookies: async () => ({
        get: () => undefined,
      }),
    }));
    vi.doMock("@/components/auth-form", () => ({
      AuthForm: ({ socialProviders }: { socialProviders?: string[] }) => (
        <div data-testid="auth-form" data-social={(socialProviders ?? []).join(",")} />
      ),
    }));
    vi.doMock("@/components/theme-toggle", () => ({
      ThemeToggle: () => <div data-testid="theme-toggle" />,
    }));
    vi.doMock("@/components/site-footer", () => ({
      SiteFooter: () => <footer data-testid="site-footer" />,
    }));
    vi.doMock("@/components/site-header", () => ({
      SiteHeader: () => <header data-testid="site-header" />,
    }));

    const LoginPage = (await import("./page")).default;
    const html = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('data-social=""');
  });
});
