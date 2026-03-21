import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { routing } from "./routing";

const LOCALE_COOKIE = "NEXT_LOCALE";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const localeCandidate = requested ?? cookieLocale;
  const locale = hasLocale(routing.locales, localeCandidate)
    ? localeCandidate
    : hasLocale(routing.locales, cookieLocale)
      ? cookieLocale
      : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
