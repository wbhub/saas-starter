import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "fr", "pt", "zh", "ja", "ko"],
  defaultLocale: "en",
  localePrefix: "never",
});

export type AppLocale = (typeof routing.locales)[number];
