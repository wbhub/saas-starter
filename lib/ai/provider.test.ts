import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("lib/ai/provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.doMock("@/lib/logger", () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to OpenAI and uses OPENAI_API_KEY fallback", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-openai");
    const provider = await import("./provider");
    expect(provider.aiProviderName).toBe("openai");
    expect(provider.isAiProviderConfigured).toBe(true);
    expect(await provider.getAiLanguageModel("gpt-4.1-mini")).toBeTruthy();
  });

  it("uses Anthropic fallback key when AI_PROVIDER=anthropic", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    const provider = await import("./provider");
    expect(provider.aiProviderName).toBe("anthropic");
    expect(provider.isAiProviderConfigured).toBe(true);
  });

  it("uses Google fallback key when AI_PROVIDER=google", async () => {
    vi.stubEnv("AI_PROVIDER", "google");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "google-key");
    const provider = await import("./provider");
    expect(provider.aiProviderName).toBe("google");
    expect(provider.isAiProviderConfigured).toBe(true);
  });

  it("blocks known text-only model prefixes for multimodal requests", async () => {
    const provider = await import("./provider");
    expect(provider.providerSupportsModalities("gpt-3.5-turbo", ["text", "image"])).toBe(false);
    expect(provider.providerSupportsModalities("gpt-4.1-mini", ["text", "image"])).toBe(true);
  });

  it("fails closed for unknown multimodal model capabilities", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    const provider = await import("./provider");
    expect(provider.providerSupportsModalities("my-custom-model", ["text", "image"])).toBe(false);
  });

  it("applies custom provider-scoped model modality map overrides", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv(
      "AI_MODEL_MODALITIES_MAP_JSON",
      JSON.stringify({
        "anthropic:claude-3-5*": ["text", "image"],
      }),
    );

    const provider = await import("./provider");
    expect(provider.providerSupportsModalities("claude-3-5-sonnet", ["text", "image"])).toBe(true);
    expect(provider.providerSupportsModalities("claude-3-5-sonnet", ["text", "file"])).toBe(false);
  });

  it("allows only configured models in all mode and only the plan model otherwise", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    const provider = await import("./provider");

    expect(
      provider.isRequestedModelAllowed({
        requestedModel: "gpt-4o-mini",
        accessMode: "all",
        allowedModel: "gpt-4.1-mini",
      }),
    ).toBe(true);
    expect(
      provider.isRequestedModelAllowed({
        requestedModel: "my-custom-model",
        accessMode: "all",
        allowedModel: "gpt-4.1-mini",
      }),
    ).toBe(false);
    expect(
      provider.isRequestedModelAllowed({
        requestedModel: "GPT-4.1-MINI",
        accessMode: "paid",
        allowedModel: "gpt-4.1-mini",
      }),
    ).toBe(true);
    expect(
      provider.isRequestedModelAllowed({
        requestedModel: "gpt-5.4",
        accessMode: "paid",
        allowedModel: "gpt-4.1-mini",
      }),
    ).toBe(false);
  });

  it("restricts all-mode model overrides to the custom model map when one is configured", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv(
      "AI_MODEL_MODALITIES_MAP_JSON",
      JSON.stringify({
        "openai:gpt-4.1-mini": ["text"],
      }),
    );

    const provider = await import("./provider");
    expect(
      provider.isRequestedModelAllowed({
        requestedModel: "gpt-4.1-mini",
        accessMode: "all",
        allowedModel: "gpt-4.1-mini",
      }),
    ).toBe(true);
    expect(
      provider.isRequestedModelAllowed({
        requestedModel: "gpt-4o-mini",
        accessMode: "all",
        allowedModel: "gpt-4.1-mini",
      }),
    ).toBe(false);
  });
});
