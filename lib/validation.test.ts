import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidEmail, parsePlanKey, validatePasswordComplexity } from "@/lib/validation";

describe("validation helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts valid emails including subdomains and plus-addressing", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user.name+tag@sub.example.co")).toBe(true);
    expect(isValidEmail("first.last+alerts@mail.us.example.com")).toBe(true);
  });

  it("rejects malformed emails including missing tld and consecutive dots", () => {
    expect(isValidEmail("user@example")).toBe(false);
    expect(isValidEmail("a@b.c")).toBe(false);
    expect(isValidEmail("user@.com")).toBe(false);
    expect(isValidEmail("user@example..com")).toBe(false);
    expect(isValidEmail("foo@-example.com")).toBe(false);
  });

  it("rejects emails with local parts longer than 64 characters", () => {
    const localPart = "a".repeat(65);
    expect(isValidEmail(`${localPart}@example.com`)).toBe(false);
  });

  it("rejects emails with domain labels longer than 63 characters", () => {
    const longLabel = "a".repeat(64);
    expect(isValidEmail(`user@${longLabel}.com`)).toBe(false);
  });

  it("accepts passwords between 12 and 128 characters", () => {
    expect(validatePasswordComplexity("a".repeat(12)).valid).toBe(true);
    expect(validatePasswordComplexity("a".repeat(128)).valid).toBe(true);
  });

  it("rejects passwords shorter than 12 or longer than 128 characters", () => {
    expect(validatePasswordComplexity("shortpass").valid).toBe(false);
    expect(validatePasswordComplexity("a".repeat(129)).valid).toBe(false);
  });

  it("returns planKey when request payload provides a valid planKey string", () => {
    expect(parsePlanKey({ planKey: "  growth " })).toBe("growth");
  });

  it("maps known stripe price ids to plan keys", () => {
    vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
    vi.stubEnv("STRIPE_GROWTH_PRICE_ID", "price_growth");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");

    expect(parsePlanKey({ priceId: "price_starter" })).toBe("starter");
    expect(parsePlanKey({ priceId: " price_growth " })).toBe("growth");
    expect(parsePlanKey({ priceId: "price_pro" })).toBe("pro");
  });

  it("returns null for unknown price ids and invalid plan key payloads", () => {
    vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
    expect(parsePlanKey({ priceId: "price_unknown" })).toBeNull();
    expect(parsePlanKey(null)).toBeNull();
    expect(parsePlanKey("growth")).toBeNull();
    expect(parsePlanKey({})).toBeNull();
    expect(parsePlanKey({ planKey: 42 })).toBeNull();
    expect(parsePlanKey({ planKey: "  " })).toBeNull();
    expect(parsePlanKey({ planKey: "a".repeat(101) })).toBeNull();
  });
});
