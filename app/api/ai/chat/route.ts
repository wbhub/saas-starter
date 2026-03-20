import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { logger } from "@/lib/logger";
import { openai } from "@/lib/openai/client";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { getPlanByPriceId } from "@/lib/stripe/config";
import { LIVE_SUBSCRIPTION_STATUSES, type PlanKey } from "@/lib/stripe/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTeamContextForUser } from "@/lib/team-context";

const chatPayloadSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().trim().min(1).max(8_000),
      }),
    )
    .min(1)
    .max(30),
});

const AI_PLAN_MODEL: Record<PlanKey, string | null> = {
  starter: null,
  growth: "gpt-4.1-mini",
  pro: "gpt-4.1",
};

type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
};

async function insertAiUsageRow({
  teamId,
  userId,
  model,
  promptTokens,
  completionTokens,
}: {
  teamId: string;
  userId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("ai_usage").insert({
    team_id: teamId,
    user_id: userId,
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
  });

  if (error) {
    throw error;
  }
}

export async function POST(request: Request) {
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamContext = await getTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return NextResponse.json(
      { error: "No team membership found for this account." },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `ai-chat:user:${user.id}`,
    ...RATE_LIMITS.aiChatByUser,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many AI requests. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const bodyParse = await parseJsonWithSchema(request, chatPayloadSchema);
  if (!bodyParse.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const { data: subscriptionRow, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("stripe_price_id,status")
    .eq("team_id", teamContext.teamId)
    .in("status", LIVE_SUBSCRIPTION_STATUSES)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle<{ stripe_price_id: string; status: string }>();

  if (subscriptionError) {
    logger.error("Failed to load subscription for AI chat request", subscriptionError, {
      teamId: teamContext.teamId,
      userId: user.id,
    });
    return NextResponse.json(
      { error: "Could not verify subscription for AI access." },
      { status: 500 },
    );
  }

  if (!subscriptionRow?.stripe_price_id) {
    logAuditEvent({
      action: "ai.chat.request",
      outcome: "denied",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: { reason: "no_live_subscription" },
    });
    return NextResponse.json(
      { error: "An active subscription is required to use AI features." },
      { status: 403 },
    );
  }

  const plan = getPlanByPriceId(subscriptionRow.stripe_price_id);
  const model = plan ? AI_PLAN_MODEL[plan.key] : null;
  if (!plan || !model) {
    logAuditEvent({
      action: "ai.chat.request",
      outcome: "denied",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: {
        reason: "plan_not_allowed",
        stripePriceId: subscriptionRow.stripe_price_id,
      },
    });
    return NextResponse.json(
      {
        error: "AI features are available on Growth and Pro plans.",
      },
      { status: 403 },
    );
  }

  try {
    const stream = await openai.chat.completions.create({
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages: bodyParse.data.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    const encoder = new TextEncoder();
    const usage: UsageTotals = { promptTokens: 0, completionTokens: 0 };

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.usage) {
              usage.promptTokens = chunk.usage.prompt_tokens ?? 0;
              usage.completionTokens = chunk.usage.completion_tokens ?? 0;
            }

            const delta = chunk.choices[0]?.delta?.content;
            if (!delta) {
              continue;
            }

            controller.enqueue(encoder.encode(delta));
          }

          await insertAiUsageRow({
            teamId: teamContext.teamId,
            userId: user.id,
            model,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
          });

          logAuditEvent({
            action: "ai.chat.request",
            outcome: "success",
            actorUserId: user.id,
            teamId: teamContext.teamId,
            metadata: {
              planKey: plan.key,
              model,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
            },
          });

          controller.close();
        } catch (error) {
          logger.error("Failed to stream AI chat completion", error, {
            teamId: teamContext.teamId,
            userId: user.id,
            model,
          });
          logAuditEvent({
            action: "ai.chat.request",
            outcome: "failure",
            actorUserId: user.id,
            teamId: teamContext.teamId,
            metadata: { planKey: plan.key, model, reason: "stream_failed" },
          });
          controller.error(error);
        }
      },
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error("Failed to create AI chat completion stream", error, {
      teamId: teamContext.teamId,
      userId: user.id,
      model,
    });
    logAuditEvent({
      action: "ai.chat.request",
      outcome: "failure",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: { planKey: plan.key, model, reason: "openai_create_failed" },
    });
    return NextResponse.json(
      { error: "Unable to generate AI response right now. Please try again." },
      { status: 500 },
    );
  }
}
