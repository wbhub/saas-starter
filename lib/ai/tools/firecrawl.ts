import { env } from "@/lib/env";
import { tool } from "ai";
import { z } from "zod";

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|::1|\[::1\])/;

const firecrawlScrapeParams = z.object({
  url: z
    .string()
    .url()
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "https:" || protocol === "http:";
      } catch {
        return false;
      }
    }, "URL must use http or https.")
    .refine((value) => {
      try {
        return !PRIVATE_HOST_RE.test(new URL(value).hostname);
      } catch {
        return false;
      }
    }, "URL must not target private or internal addresses.")
    .describe("The URL to scrape. Must be a valid public HTTP(S) URL."),
});

export const firecrawlScrapeTool = tool({
  description:
    "Scrape a web page and return its content as clean markdown. Use this when the user wants to read, summarize, or extract information from a specific URL.",
  inputSchema: firecrawlScrapeParams,
  execute: async ({ url }) => {
    const apiKey = env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return { error: "Firecrawl API key is not configured." };
    }

    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
      }),
    });

    if (!response.ok) {
      return { error: `Firecrawl scrape failed with status ${response.status}.` };
    }

    const data = await response.json();
    const scrapeData = data.data ?? data;
    return {
      title: scrapeData.metadata?.title ?? null,
      description: scrapeData.metadata?.description ?? null,
      url: scrapeData.metadata?.sourceURL ?? url,
      markdown: scrapeData.markdown ? scrapeData.markdown.slice(0, 8000) : null,
    };
  },
});
