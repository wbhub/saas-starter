import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DashboardShellColumns,
  DashboardShellFrame,
  DashboardShellSection,
  PublicCenteredContent,
  PublicShell,
} from "./layout-shells";

describe("layout-shells", () => {
  it("renders the public shell with the shared public container", () => {
    const html = renderToStaticMarkup(
      <PublicShell as="main" className="py-12">
        <div>Public content</div>
      </PublicShell>,
    );

    expect(html).toContain("<main");
    expect(html).toContain("max-w-[1440px]");
    expect(html).toContain("py-12");
  });

  it("renders centered public content with a readable form width", () => {
    const html = renderToStaticMarkup(
      <PublicCenteredContent>
        <div>Auth content</div>
      </PublicCenteredContent>,
    );

    expect(html).toContain("max-w-md");
    expect(html).toContain("justify-center");
  });

  it("renders dashboard shell primitives with shared dashboard layout classes", () => {
    const html = renderToStaticMarkup(
      <DashboardShellFrame className="py-8">
        <DashboardShellColumns>
          <aside>Nav</aside>
          <DashboardShellSection className="space-y-6">
            <div>Dashboard content</div>
          </DashboardShellSection>
        </DashboardShellColumns>
      </DashboardShellFrame>,
    );

    expect(html).toContain("max-w-[1680px]");
    expect(html).toContain("lg:grid-cols-[240px_minmax(0,1fr)]");
    expect(html).toContain("max-w-[56rem]");
    expect(html).toContain("space-y-6");
  });
});
