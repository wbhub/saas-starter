const TRIGGER_SECRET_KEY_ENV_KEY = "TRIGGER_SECRET_KEY" as const;
const TRIGGER_PROJECT_REF_ENV_KEY = "TRIGGER_PROJECT_REF" as const;

function getTrimmedEnv(key: typeof TRIGGER_SECRET_KEY_ENV_KEY | typeof TRIGGER_PROJECT_REF_ENV_KEY) {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function getTriggerSecretKeyIfConfigured() {
  return getTrimmedEnv(TRIGGER_SECRET_KEY_ENV_KEY) ?? null;
}

export function getTriggerProjectRefIfConfigured() {
  return getTrimmedEnv(TRIGGER_PROJECT_REF_ENV_KEY) ?? null;
}

export function isTriggerConfigured() {
  return Boolean(getTriggerSecretKeyIfConfigured());
}
