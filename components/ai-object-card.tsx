"use client";

import { useState } from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { resolveUserFacingErrorMessage } from "@/lib/ai/error-message";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SchemaSelector } from "@/components/ai/schema-selector";
import { cn } from "@/lib/utils";

const sentimentResponseSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const entityExtractionResponseSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["person", "organization", "location", "date", "product", "other"]),
      context: z.string(),
    }),
  ),
  summary: z.string(),
});

const contentClassificationResponseSchema = z.object({
  categories: z.array(
    z.object({
      label: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  primaryCategory: z.string(),
  tone: z.enum(["formal", "informal", "technical", "casual", "academic", "conversational"]),
  language: z.string(),
});

type SchemaConfig = {
  key: string;
  label: string;
  schema: z.ZodType;
  placeholder: string;
};

const SCHEMAS: SchemaConfig[] = [
  {
    key: "sentiment",
    label: "Sentiment Analysis",
    schema: sentimentResponseSchema,
    placeholder: "Enter text to analyze sentiment...",
  },
  {
    key: "entityExtraction",
    label: "Entity Extraction",
    schema: entityExtractionResponseSchema,
    placeholder: "Enter text to extract entities from...",
  },
  {
    key: "contentClassification",
    label: "Content Classification",
    schema: contentClassificationResponseSchema,
    placeholder: "Enter text to classify...",
  },
];

function SentimentResult({
  object,
}: {
  object: z.infer<typeof sentimentResponseSchema> | undefined;
}) {
  if (!object) return null;
  const sentimentColor =
    object.sentiment === "positive"
      ? "text-green-700 dark:text-green-400"
      : object.sentiment === "negative"
        ? "text-red-700 dark:text-red-400"
        : "text-yellow-700 dark:text-yellow-400";

  return (
    <div className="space-y-3">
      {object.sentiment !== undefined ? (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Sentiment</span>
          <span className={`text-sm font-semibold capitalize ${sentimentColor}`}>
            {object.sentiment}
          </span>
        </div>
      ) : null}
      {object.confidence !== undefined ? (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Confidence</span>
          <span className="text-sm font-medium text-foreground">
            {Math.round(object.confidence * 100)}%
          </span>
        </div>
      ) : null}
      {object.reasoning ? (
        <div>
          <span className="text-sm font-medium text-muted-foreground">Reasoning</span>
          <p className="mt-1 text-sm text-foreground">{object.reasoning}</p>
        </div>
      ) : null}
    </div>
  );
}

function EntityResult({
  object,
}: {
  object: z.infer<typeof entityExtractionResponseSchema> | undefined;
}) {
  if (!object) return null;

  return (
    <div className="space-y-3">
      {object.summary ? (
        <div>
          <span className="text-sm font-medium text-muted-foreground">Summary</span>
          <p className="mt-1 text-sm text-foreground">{object.summary}</p>
        </div>
      ) : null}
      {object.entities?.length ? (
        <div>
          <span className="text-sm font-medium text-muted-foreground">Entities</span>
          <div className="mt-1 space-y-1">
            {object.entities.map((entity, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="inline-block rounded bg-surface-hover px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {entity.type}
                </span>
                <span className="text-sm font-medium text-foreground">{entity.name}</span>
                {entity.context ? (
                  <span className="text-xs text-muted-foreground">— {entity.context}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClassificationResult({
  object,
}: {
  object: z.infer<typeof contentClassificationResponseSchema> | undefined;
}) {
  if (!object) return null;

  return (
    <div className="space-y-3">
      {object.primaryCategory ? (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Primary Category</span>
          <span className="text-sm font-semibold text-foreground">{object.primaryCategory}</span>
        </div>
      ) : null}
      {object.tone ? (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Tone</span>
          <span className="text-sm font-medium capitalize text-foreground">{object.tone}</span>
        </div>
      ) : null}
      {object.language ? (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Language</span>
          <span className="text-sm font-medium text-foreground">{object.language}</span>
        </div>
      ) : null}
      {object.categories?.length ? (
        <div>
          <span className="text-sm font-medium text-muted-foreground">All Categories</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {object.categories.map((cat, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs"
              >
                <span className="font-medium text-foreground">{cat.label}</span>
                {cat.confidence !== undefined ? (
                  <span className="text-muted-foreground">{Math.round(cat.confidence * 100)}%</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const RESULT_RENDERERS: Record<string, React.ComponentType<{ object: unknown }>> = {
  sentiment: SentimentResult as React.ComponentType<{ object: unknown }>,
  entityExtraction: EntityResult as React.ComponentType<{ object: unknown }>,
  contentClassification: ClassificationResult as React.ComponentType<{ object: unknown }>,
};

export function AiObjectCard() {
  const t = useTranslations("AiObjectCard");
  const [input, setInput] = useState("");
  const [selectedSchema, setSelectedSchema] = useState("sentiment");

  const schemaConfig = SCHEMAS.find((s) => s.key === selectedSchema) ?? SCHEMAS[0];

  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/ai/object",
    schema: schemaConfig.schema,
    headers: getCsrfHeaders,
    id: selectedSchema,
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
    if (!value || isLoading) return;
    submit({ schemaName: selectedSchema, prompt: value });
  }

  const ResultRenderer = RESULT_RENDERERS[selectedSchema];

  return (
    <div className="flex min-h-[min(480px,calc(100vh-260px))] flex-col">
      <header className="border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-5 py-5 sm:px-6">
        <SchemaSelector
          schemas={SCHEMAS.map((s) => ({ key: s.key, label: s.label }))}
          selected={selectedSchema}
          onSelect={setSelectedSchema}
        />

        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={4}
            placeholder={schemaConfig.placeholder}
            disabled={isLoading}
            className="min-h-[120px] resize-none rounded-xl border-border/70 text-[15px] leading-relaxed shadow-sm"
          />
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border/40 pt-4">
            <Button
              type="submit"
              size="lg"
              disabled={isLoading || input.trim().length === 0}
              className="min-w-[8.5rem] gap-2 bg-primary px-6 text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("actions.analyzing")}
                </>
              ) : (
                <>
                  <Sparkles className="size-4 opacity-90" aria-hidden />
                  {t("actions.analyze")}
                </>
              )}
            </Button>
            {isLoading ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => stop()}
                className="min-w-[5.5rem] border-border/80 bg-background px-5 shadow-sm hover:bg-muted/50"
              >
                {t("actions.stop")}
              </Button>
            ) : null}
          </div>
        </form>

        {error ? (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {resolveUserFacingErrorMessage(error, t("errors.requestFailed"), errorMessagesByCode)}
          </p>
        ) : null}

        {object && ResultRenderer ? (
          <div
            className={cn(
              "rounded-xl border border-border/60 bg-muted/30 p-5 shadow-inner",
              "dark:bg-muted/20",
            )}
          >
            <ResultRenderer object={object} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
