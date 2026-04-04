// @vitest-environment jsdom

import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./site-footer";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("SiteFooter", () => {
  it("keeps the public footer on the narrower public shell", () => {
    const { container } = render(<SiteFooter />);

    expect(container.innerHTML).toContain("privacy-policy");
    expect(container.innerHTML).toContain("max-w-[1440px]");
    expect(container.innerHTML).not.toContain("max-w-[56rem]");
  });

  it("aligns dashboard footer links to the dashboard content rail", () => {
    const { container } = render(<SiteFooter dashboard />);

    expect(container.innerHTML).toContain("privacy-policy");
    expect(container.innerHTML).toContain("max-w-[1680px]");
    expect(container.innerHTML).toContain("max-w-[56rem]");
  });
});
