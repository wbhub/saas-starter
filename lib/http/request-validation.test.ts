import { describe, expect, it } from "vitest";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";

describe("parseJsonWithSchema", () => {
  it("marks parse result as tooLarge when content-length exceeds limit", async () => {
    const schema = z.object({ ok: z.boolean() });
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "1024",
      },
      body: "{}",
    });

    const result = await parseJsonWithSchema(request, schema, { maxBytes: 10 });
    expect(result.success).toBe(false);
    expect(result.tooLarge).toBe(true);
  });

  it("returns schema failure for malformed json payloads", async () => {
    const schema = z.object({ value: z.string() });
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{not-valid-json",
    });

    const result = await parseJsonWithSchema(request, schema, { maxBytes: 1024 });
    expect(result.success).toBe(false);
    expect(result.tooLarge).toBeUndefined();
  });

  it("rejects oversized body during streaming even when content-length lies", async () => {
    const schema = z.object({ value: z.string() });
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "10",
      },
      body: JSON.stringify({ value: "x".repeat(1024) }),
    });

    const result = await parseJsonWithSchema(request, schema, { maxBytes: 128 });
    expect(result.success).toBe(false);
    expect(result.tooLarge).toBe(true);
  });
});
