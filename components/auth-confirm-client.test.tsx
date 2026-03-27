// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_MARKER_KEY } from "@/lib/auth/recovery-marker";
import { AuthConfirmClient } from "./auth-confirm-client";

const setSession = vi.fn();
const getSession = vi.fn();
const originalLocation = window.location;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      setSession,
      getSession,
    },
  }),
}));

describe("AuthConfirmClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("hydrates a recovery session from the URL hash and redirects to reset-password", async () => {
    const replace = vi.fn();

    setSession.mockResolvedValue({
      data: {
        session: {
          user: { id: "user_123" },
        },
      },
      error: null,
    });

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        href: "http://localhost:3000/auth/confirm?next=/reset-password#access_token=test-access&refresh_token=test-refresh&type=recovery",
        replace,
      },
    });

    render(<AuthConfirmClient />);

    await waitFor(() => {
      expect(setSession).toHaveBeenCalledWith({
        access_token: "test-access",
        refresh_token: "test-refresh",
      });
    });

    expect(window.sessionStorage.getItem(RECOVERY_MARKER_KEY)).toBeTruthy();
    expect(replace).toHaveBeenCalledWith("http://localhost:3000/reset-password");
    expect(getSession).not.toHaveBeenCalled();
  });
});
