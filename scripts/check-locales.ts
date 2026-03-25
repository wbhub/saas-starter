/**
 * CI check: Ensures routed locales have matching message catalogs with the same key shape
 * and placeholder contracts as the English base catalog.
 * Run with: npx tsx scripts/check-locales.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { routing } from "../i18n/routing";

const ROOT = process.cwd();
const MESSAGES_DIR = join(ROOT, "messages");
const BASE_LOCALE = "en";
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function describeType(value: unknown) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function getPlaceholderTokens(value: string) {
  return [...new Set(Array.from(value.matchAll(PLACEHOLDER_PATTERN), (match) => match[1]))].sort();
}

function compareMessages(
  baseValue: unknown,
  localeValue: unknown,
  path: string,
  locale: string,
  issues: string[],
) {
  if (isPlainObject(baseValue)) {
    if (!isPlainObject(localeValue)) {
      issues.push(
        `${locale}: ${path || "<root>"} should be an object, found ${describeType(localeValue)}.`,
      );
      return;
    }

    const baseKeys = Object.keys(baseValue).sort();
    const localeKeys = Object.keys(localeValue).sort();

    for (const key of baseKeys) {
      if (!(key in localeValue)) {
        const nextPath = path ? `${path}.${key}` : key;
        issues.push(`${locale}: missing key ${nextPath}.`);
      }
    }

    for (const key of localeKeys) {
      if (!(key in baseValue)) {
        const nextPath = path ? `${path}.${key}` : key;
        issues.push(`${locale}: extra key ${nextPath}.`);
      }
    }

    for (const key of baseKeys) {
      if (!(key in localeValue)) {
        continue;
      }

      const nextPath = path ? `${path}.${key}` : key;
      compareMessages(baseValue[key], localeValue[key], nextPath, locale, issues);
    }

    return;
  }

  if (Array.isArray(baseValue)) {
    if (!Array.isArray(localeValue)) {
      issues.push(
        `${locale}: ${path || "<root>"} should be an array, found ${describeType(localeValue)}.`,
      );
      return;
    }

    if (baseValue.length !== localeValue.length) {
      issues.push(
        `${locale}: ${path || "<root>"} length ${localeValue.length} does not match base length ${baseValue.length}.`,
      );
    }

    const limit = Math.min(baseValue.length, localeValue.length);
    for (let index = 0; index < limit; index += 1) {
      compareMessages(baseValue[index], localeValue[index], `${path}[${index}]`, locale, issues);
    }

    return;
  }

  if (describeType(baseValue) !== describeType(localeValue)) {
    issues.push(
      `${locale}: ${path || "<root>"} should be ${describeType(baseValue)}, found ${describeType(localeValue)}.`,
    );
    return;
  }

  if (typeof baseValue === "string" && typeof localeValue === "string") {
    const baseTokens = getPlaceholderTokens(baseValue);
    const localeTokens = getPlaceholderTokens(localeValue);

    if (baseTokens.join(",") !== localeTokens.join(",")) {
      issues.push(
        `${locale}: placeholder mismatch at ${path}. Expected [${baseTokens.join(", ")}], found [${localeTokens.join(", ")}].`,
      );
    }
  }
}

function getNestedValue(source: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isPlainObject(current)) {
      return undefined;
    }
    return current[key];
  }, source);
}

function readCatalog(locale: string) {
  const filePath = join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

const issues: string[] = [];
const expectedLocales = [...routing.locales].sort();
const expectedLocaleSet = new Set<string>(expectedLocales);
const actualLocales = readdirSync(MESSAGES_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/u, ""))
  .sort();
const actualLocaleSet = new Set(actualLocales);

for (const locale of expectedLocales) {
  if (!actualLocaleSet.has(locale)) {
    issues.push(`messages/${locale}.json is missing.`);
  }
}

for (const locale of actualLocales) {
  if (!expectedLocaleSet.has(locale)) {
    issues.push(`messages/${locale}.json is not declared in i18n/routing.ts.`);
  }
}

if (issues.length === 0) {
  const baseCatalog = readCatalog(BASE_LOCALE);

  for (const locale of expectedLocales) {
    const localeCatalog = readCatalog(locale);
    compareMessages(baseCatalog, localeCatalog, "", locale, issues);

    const localeNames = getNestedValue(localeCatalog, "LocaleSwitcher.localeNames");
    if (!isPlainObject(localeNames)) {
      issues.push(`${locale}: LocaleSwitcher.localeNames is missing or invalid.`);
      continue;
    }

    for (const localeNameKey of Object.keys(localeNames).sort()) {
      if (!expectedLocaleSet.has(localeNameKey)) {
        issues.push(
          `${locale}: LocaleSwitcher.localeNames.${localeNameKey} is declared but not routed.`,
        );
      }
    }

    for (const routedLocale of expectedLocales) {
      if (!(routedLocale in localeNames)) {
        issues.push(`${locale}: LocaleSwitcher.localeNames.${routedLocale} is missing.`);
      }
    }
  }
}

if (issues.length > 0) {
  console.error("❌ Locale catalogs are out of sync:");
  for (const issue of issues) {
    console.error(`   ${issue}`);
  }
  console.error(
    "\nEvery routed locale must have a messages/<locale>.json file matching messages/en.json.",
    "\nPlaceholder tokens like {name} must stay identical across translations.",
  );
  process.exit(1);
}

console.log(`✅ Locale catalogs: ${expectedLocales.join(", ")} are in sync with messages/en.json.`);
