// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntercomProvider } from "./intercom-provider";

const unsubscribe = vi.fn();
const onAuthStateChange = vi.fn(() => ({
  data: {
    subscription: {
      unsubscribe,
    },
  },
}));

function createIntercomMock(): NonNullable<Window["Intercom"]> {
  return vi.fn() as unknown as NonNullable<Window["Intercom"]>;
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange,
    },
  }),
}));

describe("IntercomProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.head.innerHTML = "";
    window.intercomSettings = undefined;
    window.Intercom = createIntercomMock();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          user: {
            id: "user_123",
            email: "user@example.com",
            name: "Test User",
            createdAt: "2026-01-01T00:00:00Z",
            userHash: "hash_123",
          },
        }),
      }),
    );
  });

  it("fetches the Intercom boot payload after mount when only appId is provided", async () => {
    render(<IntercomProvider appId="app_123" />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/intercom/boot", { cache: "no-store" });
    });

    await waitFor(() => {
      expect(window.Intercom).toHaveBeenCalledWith(
        "boot",
        expect.objectContaining({
          app_id: "app_123",
          user_id: "user_123",
          email: "user@example.com",
        }),
      );
    });

    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("boots immediately and skips the fetch when user data is already provided", async () => {
    render(
      <IntercomProvider
        appId="app_123"
        user={{
          id: "user_456",
          email: "existing@example.com",
          name: "Existing User",
          createdAt: "2026-01-02T00:00:00Z",
          userHash: "hash_456",
        }}
      />,
    );

    await waitFor(() => {
      expect(window.Intercom).toHaveBeenCalledWith(
        "boot",
        expect.objectContaining({
          app_id: "app_123",
          user_id: "user_456",
          email: "existing@example.com",
        }),
      );
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
