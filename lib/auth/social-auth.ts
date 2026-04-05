import { publicEnv } from "@/lib/public-env";

export const LAST_AUTH_PROVIDER_COOKIE = "auth_last_provider";

export type AuthProvider = "google" | "microsoft";
export type SupabaseOAuthProvider = "google" | "azure";
export type SocialProviderOption = {
  provider: AuthProvider;
  label: string;
  isLastUsed: boolean;
};

const ENABLED_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
export type LoginMethod = "magic-link" | "magic-link-and-password" | "password";
const VALID_LOGIN_METHODS = new Set<LoginMethod>([
  "magic-link",
  "magic-link-and-password",
  "password",
]);

function isEnabledFlag(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ENABLED_TRUE_VALUES.has(value.trim().toLowerCase());
}

export function getEnabledSocialAuthProviders(): AuthProvider[] {
  const providers: AuthProvider[] = [];

  if (isEnabledFlag(publicEnv.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED)) {
    providers.push("google");
  }
  if (isEnabledFlag(publicEnv.NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED)) {
    providers.push("microsoft");
  }

  return providers;
}

export function parseAuthProvider(provider: string | null | undefined): AuthProvider | null {
  if (provider === "google" || provider === "microsoft") {
    return provider;
  }
  return null;
}

export function parseSupabaseProvider(provider: string | null | undefined): AuthProvider | null {
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

export function toSupabaseOAuthProvider(provider: AuthProvider): SupabaseOAuthProvider {
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

export function getLoginMethod(): LoginMethod {
  const value = publicEnv.NEXT_PUBLIC_AUTH_LOGIN_METHOD?.toLowerCase() as LoginMethod | undefined;
  if (value && VALID_LOGIN_METHODS.has(value)) return value;
  return "magic-link";
}

export function isPasswordAuthEnabled() {
  return getLoginMethod() !== "magic-link";
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
