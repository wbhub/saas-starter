import { describe, expect, it } from "vitest";
import { computeScaledDimensions } from "./compress-chat-image";

describe("computeScaledDimensions", () => {
  it("returns original size when within long edge", () => {
    expect(computeScaledDimensions(2048, 800, 600)).toEqual({ width: 800, height: 600 });
    expect(computeScaledDimensions(2048, 2048, 1000)).toEqual({ width: 2048, height: 1000 });
  });

  it("scales down proportionally when long edge exceeds max", () => {
    expect(computeScaledDimensions(1024, 2000, 1000)).toEqual({ width: 1024, height: 512 });
    expect(computeScaledDimensions(1000, 500, 2000)).toEqual({ width: 250, height: 1000 });
  });

  it("never returns dimensions below 1", () => {
    expect(computeScaledDimensions(1, 10, 10)).toEqual({ width: 1, height: 1 });
    expect(computeScaledDimensions(100, 1, 5000)).toEqual({ width: 1, height: 100 });
  });
});
