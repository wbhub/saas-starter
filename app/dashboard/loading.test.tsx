import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DashboardLoading from "./loading";

describe("DashboardLoading", () => {
  it("renders only the dashboard content skeleton", () => {
    const html = renderToStaticMarkup(<DashboardLoading />);

    expect(html).toContain('data-testid="dashboard-loading-content"');
    expect(html).not.toContain("border-b app-border-subtle");
    expect(html).not.toContain("lg:grid-cols-[260px_minmax(0,1fr)]");
  });
});
