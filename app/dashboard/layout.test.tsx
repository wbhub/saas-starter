import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DashboardLayout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("renders Intercom without loading dashboard auth state on the server", async () => {
    const createClient = vi.fn();

    vi.doMock("@/components/intercom-provider", () => ({
      IntercomProvider: ({ appId }: { appId?: string }) => (
        <div data-testid="intercom-provider" data-app-id={appId} />
      ),
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        NEXT_PUBLIC_INTERCOM_APP_ID: "app_123",
        INTERCOM_IDENTITY_SECRET: "identity-secret",
      },
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient,
    }));

    const DashboardLayout = (await import("./layout")).default;
    const html = renderToStaticMarkup(
      <DashboardLayout>
        <div>dashboard child</div>
      </DashboardLayout>,
    );

    expect(createClient).not.toHaveBeenCalled();
    expect(html).toContain('data-app-id="app_123"');
    expect(html).toContain("dashboard child");
  });
});
