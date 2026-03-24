import { env } from "@/lib/env";

export function getTriggerSecretKeyIfConfigured() {
  return env.TRIGGER_SECRET_KEY ?? null;
}

export function getTriggerProjectRefIfConfigured() {
  return env.TRIGGER_PROJECT_REF ?? null;
}

export function isTriggerConfigured() {
  return Boolean(getTriggerSecretKeyIfConfigured());
}
