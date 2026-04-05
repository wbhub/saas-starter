// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageMetadata } from "./message-metadata";

describe("MessageMetadata", () => {
  it("renders a friendly model label instead of the raw provider-prefixed model id", () => {
    render(<MessageMetadata model="anthropic:claude-opus-4-6" />);

    expect(screen.getByText("Claude Opus 4.6")).toBeInTheDocument();
    expect(screen.queryByText("anthropic:claude-opus-4-6")).not.toBeInTheDocument();
  });
});
