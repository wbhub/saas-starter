// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormMessage } from "./form-message";

describe("FormMessage", () => {
  it("renders nothing when message is null", () => {
    const { container } = render(<FormMessage status="idle" message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders error message with alert role", () => {
    render(<FormMessage status="error" message="Something went wrong" />);
    const el = screen.getByRole("alert");
    expect(el).toHaveTextContent("Something went wrong");
    expect(el.className).toContain("text-rose-700");
  });

  it("renders success message with status role", () => {
    render(<FormMessage status="success" message="Saved successfully" />);
    const el = screen.getByRole("status");
    expect(el).toHaveTextContent("Saved successfully");
    expect(el.className).toContain("text-muted-foreground");
  });

  it("passes through id attribute for aria-describedby", () => {
    render(<FormMessage status="error" message="Oops" id="form-error" />);
    expect(screen.getByRole("alert")).toHaveAttribute("id", "form-error");
  });

  it("uses assertive aria-live for errors", () => {
    render(<FormMessage status="error" message="Error" />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  it("uses polite aria-live for non-errors", () => {
    render(<FormMessage status="success" message="Done" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
