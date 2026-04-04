import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardPageHeader, DashboardPageStack } from "./dashboard-page-header";

describe("dashboard-page-header", () => {
  it("renders the shared dashboard page heading with the expected copy hierarchy", () => {
    const html = renderToStaticMarkup(
      <DashboardPageHeader
        eyebrow="Settings"
        title="Workspace settings"
        description="Manage account details, security, and team configuration."
      />,
    );

    expect(html).toContain("Settings");
    expect(html).toContain("Workspace settings");
    expect(html).toContain("Manage account details");
    expect(html).toContain("max-w-2xl");
  });

  it("renders the shared dashboard page stack spacing wrapper", () => {
    const html = renderToStaticMarkup(
      <DashboardPageStack className="data-test-stack">
        <div>One</div>
        <div>Two</div>
      </DashboardPageStack>,
    );

    expect(html).toContain("space-y-5");
    expect(html).toContain("sm:space-y-6");
    expect(html).toContain("data-test-stack");
  });
});
