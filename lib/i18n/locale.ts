import { parse as parseCookieHeader } from "cookie";
import { hasLocale } from "next-intl";
import { routing, type AppLocale } from "@/i18n/routing";

const LOCALE_COOKIE = "NEXT_LOCALE";

function detectLocaleFromAcceptLanguage(acceptLanguageHeader: string | null) {
  if (!acceptLanguageHeader) {
    return null;
  }

  const languageCandidates = acceptLanguageHeader
    .split(",")
    .map((entry) => entry.split(";")[0]?.trim().toLowerCase())
    .filter((entry): entry is string => Boolean(entry));

  for (const candidate of languageCandidates) {
    if (hasLocale(routing.locales, candidate)) {
      return candidate;
    }

    const baseLanguage = candidate.split("-")[0];
    if (baseLanguage && hasLocale(routing.locales, baseLanguage)) {
      return baseLanguage;
    }
  }

  return null;
}

export function resolveRequestLocale(request: Request): AppLocale {
  const cookieHeader = request.headers.get("cookie");
  const cookieLocale = cookieHeader ? parseCookieHeader(cookieHeader)[LOCALE_COOKIE] : null;
  const acceptLanguageLocale = detectLocaleFromAcceptLanguage(
    request.headers.get("accept-language"),
  );

  if (hasLocale(routing.locales, cookieLocale)) {
    return cookieLocale;
  }
  if (hasLocale(routing.locales, acceptLanguageLocale)) {
    return acceptLanguageLocale;
  }
  return routing.defaultLocale;
}

type TranslationValues = Record<string, string | number>;

function getNestedValue(source: unknown, key: string) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const parts = key.split(".");
  let current: unknown = source;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function formatMessage(template: string, values?: TranslationValues) {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined ? `{${token}}` : String(value);
  });
}

export async function getLocaleTranslator(namespace: string, locale: AppLocale) {
  const messagesModule = await import(`../../messages/${locale}.json`);
  const namespaceObject = getNestedValue(messagesModule.default, namespace);

  return (key: string, values?: TranslationValues) => {
    const raw = getNestedValue(namespaceObject, key);
    if (typeof raw !== "string") {
      return `${namespace}.${key}`;
    }
    return formatMessage(raw, values);
  };
}

export async function getRouteTranslator(namespace: string, request: Request) {
  return getLocaleTranslator(namespace, resolveRequestLocale(request));
}
