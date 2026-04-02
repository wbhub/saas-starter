import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const providerMockState = vi.hoisted(() => ({
  aiProviderName: "openai" as "openai" | "anthropic" | "google",
}));

vi.mock("@/lib/ai/provider", () => ({
  get aiProviderName() {
    return providerMockState.aiProviderName;
  },
  isAiProviderConfigured: true,
}));

describe("POST /api/ai/files", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    providerMockState.aiProviderName = "openai";
    vi.stubEnv("AI_PROVIDER_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");

    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uploads PDF attachments to OpenAI and returns a fileId", async () => {
    providerMockState.aiProviderName = "openai";
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "file_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const formData = new FormData();
    formData.set("file", new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" }));

    const response = await POST(
      new Request("http://localhost/api/ai/files", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      fileId: "file_123",
      name: "contract.pdf",
      mimeType: "application/pdf",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/files",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-openai-key",
        },
        body: expect.any(FormData),
      }),
    );
  });

  it("uploads supported attachments to Anthropic and returns a fileId", async () => {
    providerMockState.aiProviderName = "anthropic";
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "file_ant_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const formData = new FormData();
    formData.set("file", new File(["notes"], "notes.txt", { type: "text/plain" }));

    const response = await POST(
      new Request("http://localhost/api/ai/files", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      fileId: "file_ant_123",
      name: "notes.txt",
      mimeType: "text/plain",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/files",
      expect.objectContaining({
        method: "POST",
        headers: {
          "x-api-key": "test-anthropic-key",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "files-api-2025-04-14",
        },
        body: expect.any(FormData),
      }),
    );
  });

  it("uploads supported attachments to Google and returns a file URL", async () => {
    providerMockState.aiProviderName = "google";
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-google-key");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: {
            "x-goog-upload-url": "https://upload.example.com/resumable",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            file: {
              uri: "https://generativelanguage.googleapis.com/v1beta/files/file_google_123",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const formData = new FormData();
    formData.set("file", new File(["id,name\n1,Ada"], "report.csv", { type: "text/csv" }));

    const response = await POST(
      new Request("http://localhost/api/ai/files", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      url: "https://generativelanguage.googleapis.com/v1beta/files/file_google_123",
      name: "report.csv",
      mimeType: "text/csv",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://generativelanguage.googleapis.com/upload/v1beta/files",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "test-google-key",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Type": "text/csv",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://upload.example.com/resumable",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize",
        }),
        body: expect.any(File),
      }),
    );
  });

  it("rejects unsupported file types before calling the provider", async () => {
    providerMockState.aiProviderName = "openai";
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const formData = new FormData();
    formData.set("file", new File(['{"ok":true}'], "payload.json", { type: "application/json" }));

    const response = await POST(
      new Request("http://localhost/api/ai/files", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unsupported attachment type.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized uploads before calling the provider", async () => {
    providerMockState.aiProviderName = "openai";
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const formData = new FormData();
    formData.set("file", new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" }));

    const response = await POST(
      new Request("http://localhost/api/ai/files", {
        method: "POST",
        headers: {
          "content-length": String(26 * 1024 * 1024),
        },
        body: formData,
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Request payload is too large.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
