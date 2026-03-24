// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";

describe("Input", () => {
  it("renders an editable input by default", () => {
    render(<Input placeholder="Enter text" />);
    const input = screen.getByPlaceholderText("Enter text");
    expect(input).not.toHaveAttribute("readonly");
    expect(input.className).toContain("bg-transparent");
    expect(input.className).toContain("focus:ring-2");
  });

  it("renders a readonly input for readonly variant", () => {
    render(<Input variant="readonly" value="test@example.com" />);
    const input = screen.getByDisplayValue("test@example.com");
    expect(input).toHaveAttribute("readonly");
    expect(input.className).toContain("app-surface-subtle");
    expect(input.className).toContain("text-muted-foreground");
  });

  it("renders readonly when readOnly prop is passed", () => {
    render(<Input readOnly value="readonly value" />);
    const input = screen.getByDisplayValue("readonly value");
    expect(input).toHaveAttribute("readonly");
    expect(input.className).toContain("app-surface-subtle");
  });

  it("allows custom className override", () => {
    render(<Input className="custom-class" placeholder="custom" />);
    const input = screen.getByPlaceholderText("custom");
    expect(input.className).toBe("custom-class");
  });

  it("forwards standard input attributes", () => {
    render(<Input type="email" name="email" required placeholder="Email" />);
    const input = screen.getByPlaceholderText("Email");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("name", "email");
    expect(input).toBeRequired();
  });
});
