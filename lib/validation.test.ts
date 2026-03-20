import { describe, expect, it } from "vitest";
import { isValidEmail, validatePasswordComplexity } from "@/lib/validation";

describe("validation helpers", () => {
  it("accepts well-formed emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user.name+tag@sub.example.co")).toBe(true);
  });

  it("rejects weak or malformed emails", () => {
    expect(isValidEmail("a@b.c")).toBe(false);
    expect(isValidEmail("user@.com")).toBe(false);
    expect(isValidEmail("user@example..com")).toBe(false);
    expect(isValidEmail("foo@-example.com")).toBe(false);
  });

  it("uses a length-focused password policy", () => {
    expect(validatePasswordComplexity("shortpass").valid).toBe(false);
    expect(validatePasswordComplexity("correct horse battery staple").valid).toBe(true);
  });
});
