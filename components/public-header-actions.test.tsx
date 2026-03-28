// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicHeaderActions } from "./public-header-actions";

const { useIsLoggedIn } = vi.hoisted(() => ({
  useIsLoggedIn: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./auth-aware-link", () => ({
  AuthAwareLink: ({
    loggedInHref,
    loggedOutHref,
    loggedInLabel,
    loggedOutLabel,
    className,
  }: {
    loggedInHref: string;
    loggedOutHref: string;
    loggedInLabel: string;
    loggedOutLabel: string;
    className: string;
  }) => (
    <a
      data-testid="auth-aware-link"
      data-logged-in-href={loggedInHref}
      data-logged-out-href={loggedOutHref}
      className={className}
    >
      {loggedInLabel}|{loggedOutLabel}
    </a>
  ),
  useIsLoggedIn,
}));

vi.mock("./locale-switcher", () => ({
  LocaleSwitcher: () => <div data-testid="locale-switcher" />,
}));

vi.mock("./theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

describe("PublicHeaderActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useIsLoggedIn.mockReturnValue(false);
  });

  it("shows login and signup CTAs when logged out", () => {
    render(
      <PublicHeaderActions loginLabel="Log in" signupLabel="Start free" openAppLabel="Open app" />,
    );

    expect(screen.getByText("Log in")).toBeInTheDocument();
    expect(screen.getByTestId("auth-aware-link")).toHaveAttribute(
      "data-logged-out-href",
      "/signup",
    );
  });

  it("hides the login link while keeping the auth-aware primary CTA when logged in", () => {
    useIsLoggedIn.mockReturnValue(true);

    render(
      <PublicHeaderActions loginLabel="Log in" signupLabel="Start free" openAppLabel="Open app" />,
    );

    expect(screen.queryByText("Log in")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-aware-link")).toHaveAttribute(
      "data-logged-in-href",
      "/dashboard",
    );
  });
});
