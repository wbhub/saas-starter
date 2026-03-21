import { describe, expect, it } from "vitest";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";

describe("parseJsonWithSchema", () => {
  it("passes valid JSON payloads that match the schema", async () => {
    const schema = z.object({ value: z.string(), count: z.number().int() });
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: "ok", count: 2 }),
    });

    const result = await parseJsonWithSchema(request, schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ value: "ok", count: 2 });
    }
  });

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
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe("invalid_type");
    }
  });

  it("returns schema failure when JSON does not satisfy the schema", async () => {
    const schema = z.object({ value: z.string(), enabled: z.boolean() });
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: 123, enabled: "yes" }),
    });

    const result = await parseJsonWithSchema(request, schema, { maxBytes: 1024 });
    expect(result.success).toBe(false);
    expect(result.tooLarge).toBeUndefined();
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(1);
    }
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

  it("treats an empty body as null and allows nullable schemas", async () => {
    const schema = z.null();
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "",
    });

    const result = await parseJsonWithSchema(request, schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it("handles requests with no body stream gracefully", async () => {
    const schema = z.null();
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: null,
    });

    const result = await parseJsonWithSchema(request, schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });
});
