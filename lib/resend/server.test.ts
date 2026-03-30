import { beforeEach, describe, expect, it, vi } from "vitest";

describe("sendResendEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("throws when Resend is not configured", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {},
    }));

    const { sendResendEmail } = await import("./server");
    await expect(
      sendResendEmail({
        from: "test@example.com",
        to: "user@example.com",
        subject: "Test",
        text: "Hello",
      }),
    ).rejects.toThrow("Resend is not configured.");
  });

  it("throws when Resend returns an error response", async () => {
    const mockSend = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Domain not verified", statusCode: 403, name: "validation_error" },
    });
    vi.doMock("resend", () => ({
      Resend: class {
        emails = { send: mockSend };
      },
    }));
    vi.doMock("@/lib/env", () => ({
      env: { RESEND_API_KEY: "re_test_123" },
    }));

    const { sendResendEmail } = await import("./server");
    await expect(
      sendResendEmail({
        from: "test@example.com",
        to: "user@example.com",
        subject: "Test",
        text: "Hello",
      }),
    ).rejects.toThrow("Resend email delivery failed: Domain not verified");
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("does not throw when Resend returns success", async () => {
    const mockSend = vi.fn().mockResolvedValue({
      data: { id: "email_123" },
      error: null,
    });
    vi.doMock("resend", () => ({
      Resend: class {
        emails = { send: mockSend };
      },
    }));
    vi.doMock("@/lib/env", () => ({
      env: { RESEND_API_KEY: "re_test_123" },
    }));

    const { sendResendEmail } = await import("./server");
    await expect(
      sendResendEmail({
        from: "test@example.com",
        to: "user@example.com",
        subject: "Test",
        text: "Hello",
      }),
    ).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledOnce();
  });
});
