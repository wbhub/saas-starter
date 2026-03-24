import { describe, expect, it } from "vitest";
import { signIntercomUserId } from "./signature";

describe("signIntercomUserId", () => {
  it("creates stable hmac signature for a user id", () => {
    const signature = signIntercomUserId("user-123", "top-secret");
    expect(signature).toBe("9b444366bd9950d979c9767be2eb1a2eb2dc7526e1e776c57ca47a4f7fff2342");
  });
});
