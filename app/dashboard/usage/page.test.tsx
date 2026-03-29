import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Dashboard usage page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects legacy usage routes to billing", async () => {
    const redirect = vi.fn(() => {
      throw new Error("redirected");
    });

    vi.doMock("next/navigation", () => ({
      redirect,
    }));

    const UsagePage = (await import("./page")).default;

    expect(() => UsagePage()).toThrow("redirected");
    expect(redirect).toHaveBeenCalledWith("/dashboard/billing");
  });
});
