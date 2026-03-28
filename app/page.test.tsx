import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Home page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("renders without reading Supabase auth state", async () => {
    const createClient = vi.fn();

    vi.doMock("@/lib/supabase/server", () => ({
      createClient,
    }));
    vi.doMock("@/components/landing-page", () => ({
      LandingPage: () => <div data-testid="landing-page" />,
    }));

    const Home = (await import("./page")).default;
    const html = renderToStaticMarkup(<Home />);

    expect(createClient).not.toHaveBeenCalled();
    expect(html).toContain("landing-page");
  });
});
