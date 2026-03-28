import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Terms of use page", () => {
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

    const TermsOfUsePage = (await import("./page")).default;
    const html = renderToStaticMarkup(<TermsOfUsePage />);

    expect(createClient).not.toHaveBeenCalled();
    expect(html).toContain("site-header");
    expect(html).toContain("Terms of Use");
  });
});
