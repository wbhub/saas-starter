// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubmitButton } from "./submit-button";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  };
});

describe("SubmitButton", () => {
  it("renders idle label when not pending", () => {
    render(<SubmitButton idleLabel="Save" pendingLabel="Saving..." />);
    expect(screen.getByRole("button")).toHaveTextContent("Save");
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("renders pending label and disables when loading prop is true", () => {
    render(<SubmitButton idleLabel="Save" pendingLabel="Saving..." loading />);
    expect(screen.getByRole("button")).toHaveTextContent("Saving...");
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies primary variant classes by default", () => {
    render(<SubmitButton idleLabel="Save" pendingLabel="Saving..." />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-btn-primary");
  });

  it("applies danger variant classes", () => {
    render(<SubmitButton variant="danger" idleLabel="Delete" pendingLabel="Deleting..." />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-rose-600");
  });

  it("respects disabled prop independently of loading", () => {
    render(<SubmitButton idleLabel="Save" pendingLabel="Saving..." disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent("Save");
  });

  it("has type=submit", () => {
    render(<SubmitButton idleLabel="Go" pendingLabel="Going..." />);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});
