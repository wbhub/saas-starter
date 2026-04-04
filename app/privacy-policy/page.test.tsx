import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Privacy policy page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("renders without loading Supabase auth state", async () => {
    const createClient = vi.fn();

    vi.doMock("@/lib/supabase/server", () => ({
      createClient,
    }));
    vi.doMock("@/components/site-header", () => ({
      SiteHeader: () => <header data-testid="site-header" />,
    }));
    vi.doMock("@/components/site-footer", () => ({
      SiteFooter: () => <footer data-testid="site-footer" />,
    }));

    const PrivacyPolicyPage = (await import("./page")).default;
    const html = renderToStaticMarkup(<PrivacyPolicyPage />);

    expect(createClient).not.toHaveBeenCalled();
    expect(html).toContain("site-header");
    expect(html).toContain("max-w-[1440px]");
    expect(html).toContain("max-w-4xl");
    expect(html).toContain("Privacy Policy");
  });
});
