// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

const push = vi.fn();
const refresh = vi.fn();
const signInWithOAuth = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === "continueWith") {
      return `continueWith:${values?.provider ?? ""}`;
    }
    return key;
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth,
    },
  }),
}));

describe("AuthForm social OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithOAuth.mockResolvedValue({ error: null });
    window.history.replaceState({}, "", "http://localhost:3000/login");
  });

  it("requests the email scope for Microsoft OAuth", async () => {
    render(<AuthForm mode="login" socialProviders={["microsoft"]} />);

    fireEvent.click(screen.getByRole("button", { name: "continueWith:Microsoft" }));

    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: "azure",
        options: {
          redirectTo: "http://localhost:3000/auth/callback?next=%2Fdashboard",
          scopes: "email",
        },
      });
    });
  });

  it("does not add the Microsoft-only scope for Google OAuth", async () => {
    render(<AuthForm mode="login" socialProviders={["google"]} />);

    fireEvent.click(screen.getByRole("button", { name: "continueWith:Google" }));

    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "http://localhost:3000/auth/callback?next=%2Fdashboard",
        },
      });
    });
  });
});
