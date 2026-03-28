import "server-only";

import { logger } from "@/lib/logger";

const SHOULD_LOG_DASHBOARD_TIMINGS = process.env.NODE_ENV === "development";

export async function measureDashboardTask<T>(
  task: string,
  context: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  if (!SHOULD_LOG_DASHBOARD_TIMINGS) {
    return run();
  }

  const startedAt = Date.now();

  try {
    const result = await run();
    logger.info("dashboard_timing", {
      task,
      durationMs: Date.now() - startedAt,
      ...context,
    });
    return result;
  } catch (error) {
    logger.warn("dashboard_timing_failed", {
      task,
      durationMs: Date.now() - startedAt,
      ...context,
      error,
    });
    throw error;
  }
}
