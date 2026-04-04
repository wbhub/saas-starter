import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("LandingPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses the narrower public container for the marketing shell", async () => {
    vi.doMock("./site-header", () => ({
      SiteHeader: () => <header data-testid="site-header" />,
    }));
    vi.doMock("./site-footer", () => ({
      SiteFooter: () => <footer data-testid="site-footer" />,
    }));
    vi.doMock("./landing/sections", () => ({
      HeroSection: () => <section>Hero</section>,
      GettingStartedSection: () => <section>Getting Started</section>,
      WhyStarterSection: () => <section>Why Starter</section>,
      BestPracticesSection: () => <section>Best Practices</section>,
      StackSection: () => <section>Stack</section>,
      PricingSection: () => <section>Pricing</section>,
      CtaFaqSection: () => <section>CTA</section>,
    }));

    const { LandingPage } = await import("./landing-page");
    const html = renderToStaticMarkup(<LandingPage />);

    expect(html).toContain('data-testid="site-header"');
    expect(html).toContain('data-testid="site-footer"');
    expect(html).toContain("max-w-[1440px]");
    expect(html).toContain("Hero");
    expect(html).toContain("Pricing");
  });
});
