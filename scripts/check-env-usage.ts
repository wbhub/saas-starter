/**
 * CI check: Ensures process.env is only used in allowlisted files.
 * Run with: npx tsx scripts/check-env-usage.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

const ALLOWLIST = new Set([
  "lib/env.ts",
  "lib/billing/provider.ts",
  "instrumentation.ts",
  "instrumentation-client.ts",
  "next.config.ts",
  "proxy.ts",
  "sentry.client.config.ts",
  "sentry.server.config.ts",
  "sentry.edge.config.ts",
  "playwright.config.ts",
  "trigger.config.ts",
]);

const ALLOWLIST_PATTERNS = [
  /^e2e\//,
  /\.test\.tsx?$/,
  /^scripts\//,
  /^lib\/security\/csrf\.ts$/,
  /^lib\/security\/rate-limit\.ts$/,
  /^lib\/logger\.ts$/,
  /^lib\/audit\.ts$/,
  // Client-side files: NEXT_PUBLIC_* is inlined at build time
  /^lib\/stripe\/client\.ts$/,
  /^app\/dashboard\/error\.tsx$/,
  /^app\/global-error\.tsx$/,
  // NODE_ENV checks in server actions (framework-level detection)
  /^app\/dashboard\/actions\.ts$/,
];

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".git", ".claude"]);

function isAllowed(file: string): boolean {
  if (ALLOWLIST.has(file)) return true;
  return ALLOWLIST_PATTERNS.some((pattern) => pattern.test(file));
}

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walk(fullPath));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walk(ROOT);
const violations: string[] = [];

for (const fullPath of files) {
  const relPath = relative(ROOT, fullPath);
  if (isAllowed(relPath)) continue;

  const content = readFileSync(fullPath, "utf8");
  if (content.includes("process.env")) {
    violations.push(relPath);
  }
}

if (violations.length > 0) {
  console.error("❌ process.env used outside allowlist in:");
  for (const file of violations) {
    console.error(`   ${file}`);
  }
  console.error(
    "\nBusiness/app code must use env.* from lib/env.ts. See CONVENTIONS.md for the allowlist.",
  );
  process.exit(1);
}

console.log("✅ process.env usage: all files are on the allowlist.");
