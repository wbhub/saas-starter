import { MINUTE_MS, SECOND_MS } from "@/lib/constants/durations";

export const CHECKOUT_IN_FLIGHT_WINDOW_MS = 60 * SECOND_MS;
export const CLIENT_IDEMPOTENCY_TTL_MS = 10 * MINUTE_MS;
export const SYNC_PENDING_RELOAD_DELAY_MS = 4 * SECOND_MS;
