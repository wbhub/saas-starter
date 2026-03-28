"use client";

import { useState } from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { resolveUserFacingErrorMessage } from "@/lib/ai/error-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Client-side schema matching the server's `sentimentSchema`.
 *
 * The `useObject` hook uses this to provide typed partial objects as they
 * stream in. Keep it in sync with `lib/ai/schemas/sentiment.ts`.
 */
const sentimentResponseSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export function AiObjectCard() {
  const t = useTranslations("AiObjectCard");
  const [input, setInput] = useState("");

  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/ai/object",
    schema: sentimentResponseSchema,
    headers: getCsrfHeaders,
  });

  const errorMessagesByCode: Record<string, string> = {
    budget_exceeded: t("errors.budgetExceeded"),
    plan_required: t("errors.planRequired"),
    upstream_rate_limited: t("errors.upstreamRateLimited"),
    upstream_bad_request: t("errors.upstreamBadRequest"),
    upstream_error: t("errors.upstreamError"),
    unknown_schema: t("errors.unknownSchema"),
  };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value || isLoading) {
      return;
    }
    submit({ schemaName: "sentiment", prompt: value });
  }

  const sentimentColor =
    object?.sentiment === "positive"
      ? "text-green-700 dark:text-green-400"
      : object?.sentiment === "negative"
        ? "text-red-700 dark:text-red-400"
        : "text-yellow-700 dark:text-yellow-400";

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <header>
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <form onSubmit={handleSubmit} className="mt-4 space-y-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          placeholder={t("placeholder")}
          disabled={isLoading}
        />
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={isLoading || input.trim().length === 0}
            className="h-auto bg-indigo-500 px-4 py-2 text-white hover:bg-indigo-400"
          >
            {isLoading ? t("actions.analyzing") : t("actions.analyze")}
          </Button>
          {isLoading ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => stop()}
              className="h-auto px-4 py-2 text-muted-foreground"
            >
              {t("actions.stop")}
            </Button>
          ) : null}
        </div>
      </form>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {resolveUserFacingErrorMessage(error, t("errors.requestFailed"), errorMessagesByCode)}
        </p>
      ) : null}

      {object ? (
        <div className="mt-4 space-y-3 rounded-lg app-surface-subtle p-4">
          {object.sentiment !== undefined ? (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {t("result.sentiment")}
              </span>
              <span className={`text-sm font-semibold capitalize ${sentimentColor}`}>
                {object.sentiment}
              </span>
            </div>
          ) : null}
          {object.confidence !== undefined ? (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {t("result.confidence")}
              </span>
              <span className="text-sm font-medium text-foreground">
                {Math.round(object.confidence * 100)}%
              </span>
            </div>
          ) : null}
          {object.reasoning ? (
            <div>
              <span className="text-sm font-medium text-muted-foreground">
                {t("result.reasoning")}
              </span>
              <p className="mt-1 text-sm text-foreground">{object.reasoning}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
