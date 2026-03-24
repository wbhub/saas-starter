import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { routing } from "./routing";

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

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const acceptLanguageLocale = detectLocaleFromAcceptLanguage(
    (await headers()).get("accept-language"),
  );
  const localeCandidate = requested ?? cookieLocale ?? acceptLanguageLocale;
  const locale = hasLocale(routing.locales, localeCandidate)
    ? localeCandidate
    : hasLocale(routing.locales, cookieLocale)
      ? cookieLocale
      : hasLocale(routing.locales, acceptLanguageLocale)
        ? acceptLanguageLocale
        : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
