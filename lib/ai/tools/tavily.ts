import { env } from "@/lib/env";
import { tool } from "ai";
import { z } from "zod";

const tavilySearchParams = z.object({
  query: z.string().min(1).max(400).describe("The search query."),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Maximum number of results to return. Defaults to 5."),
});

export const tavilySearchTool = tool({
  description:
    "Search the web for current information using Tavily. Use this when the user asks about recent events, facts you are unsure about, or anything that benefits from real-time web results.",
  inputSchema: tavilySearchParams,
  execute: async ({ query, maxResults }) => {
    const apiKey = env.TAVILY_API_KEY;
    if (!apiKey) {
      return { error: "Tavily API key is not configured." };
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults ?? 5,
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      return { error: `Tavily search failed with status ${response.status}.` };
    }

    const data = await response.json();
    return {
      answer: data.answer ?? null,
      results: (data.results ?? []).map(
        (r: { title?: string; url?: string; content?: string; score?: number }) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score,
        }),
      ),
    };
  },
});
