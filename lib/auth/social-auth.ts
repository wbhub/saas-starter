import { env } from "@/lib/env";

export const LAST_AUTH_PROVIDER_COOKIE = "auth_last_provider";

export type AuthProvider = "google" | "microsoft";
export type SupabaseOAuthProvider = "google" | "azure";
export type SocialProviderOption = {
  provider: AuthProvider;
  label: string;
  isLastUsed: boolean;
};

const ENABLED_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isEnabledFlag(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ENABLED_TRUE_VALUES.has(value.trim().toLowerCase());
}

export function getEnabledSocialAuthProviders(): AuthProvider[] {
  const providers: AuthProvider[] = [];

  if (isEnabledFlag(env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED)) {
    providers.push("google");
  }
  if (isEnabledFlag(env.NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED)) {
    providers.push("microsoft");
  }

  return providers;
}

export function parseAuthProvider(
  provider: string | null | undefined,
): AuthProvider | null {
  if (provider === "google" || provider === "microsoft") {
    return provider;
  }
  return null;
}

export function parseSupabaseProvider(
  provider: string | null | undefined,
): AuthProvider | null {
  if (!provider) {
    return null;
  }

  if (provider === "google") {
    return "google";
  }
  if (provider === "azure" || provider === "microsoft") {
    return "microsoft";
  }

  return null;
}

export function toSupabaseOAuthProvider(
  provider: AuthProvider,
): SupabaseOAuthProvider {
  if (provider === "microsoft") {
    return "azure";
  }
  return provider;
}

export function getProviderLabel(provider: AuthProvider) {
  if (provider === "microsoft") {
    return "Microsoft";
  }
  return "Google";
}

export function getSocialProviderOptions(
  providers: AuthProvider[],
  lastUsedProvider: AuthProvider | null,
): SocialProviderOption[] {
  return providers.map((provider) => ({
    provider,
    label: getProviderLabel(provider),
    isLastUsed: provider === lastUsedProvider,
  }));
}
