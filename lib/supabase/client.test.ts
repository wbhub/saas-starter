import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const createBrowserClient = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient,
}));

describe("createClient", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  });

  it("creates a browser client from static public env vars", async () => {
    const { createClient } = await import("./client");

    createClient();

    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "sb_publishable_test",
    );
  });

  it("throws when public browser env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const { createClient } = await import("./client");

    expect(() => createClient()).toThrow(
      "Missing NEXT_PUBLIC Supabase environment variables in the browser.",
    );
  });
});
