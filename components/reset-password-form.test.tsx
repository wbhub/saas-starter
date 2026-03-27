// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveRecoveryMarker } from "@/lib/auth/recovery-marker";
import { ResetPasswordForm } from "./reset-password-form";

const push = vi.fn();
const unsubscribe = vi.fn();
const getSession = vi.fn();
const updateUser = vi.fn();

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
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/validation", () => ({
  validatePasswordComplexity: () => ({ valid: true }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe,
          },
        },
      }),
      getSession,
      updateUser,
    },
  }),
}));

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: "user_123" },
        },
      },
    });
    updateUser.mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("updates the password from a recovery marker when server recovery cookies are absent", async () => {
    saveRecoveryMarker();

    render(<ResetPasswordForm hasRecoveryProof={false} recoveryUserId="" />);

    await screen.findByRole("button", { name: "updatePassword" });

    fireEvent.change(screen.getByLabelText("newPassword"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText("confirmPassword"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "updatePassword" }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ password: "correct horse battery staple" });
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(await screen.findByText("messages.passwordUpdated")).toBeInTheDocument();
  });
});
