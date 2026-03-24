/**
 * CI check: Ensures API routes use jsonSuccess/jsonError instead of raw NextResponse.json.
 * Documented exceptions (webhook, forgot-password) are allowlisted.
 * Run with: npx tsx scripts/check-response-helpers.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const API_DIR = join(ROOT, "app", "api");

const EXCEPTION_FILES = new Set([
  "app/api/stripe/webhook/route.ts",
  "app/api/auth/forgot-password/route.ts",
]);

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walk(fullPath));
    } else if (entry === "route.ts") {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walk(API_DIR);
const violations: string[] = [];

for (const fullPath of files) {
  const relPath = relative(ROOT, fullPath);
  if (relPath.endsWith(".test.ts")) continue;
  if (EXCEPTION_FILES.has(relPath)) continue;

  const content = readFileSync(fullPath, "utf8");
  if (content.includes("NextResponse.json")) {
    violations.push(relPath);
  }
}

if (violations.length > 0) {
  console.error("❌ NextResponse.json used in API routes (use jsonSuccess/jsonError instead):");
  for (const file of violations) {
    console.error(`   ${file}`);
  }
  console.error(
    "\nAPI routes should use jsonSuccess/jsonError from lib/http/api-json.ts.",
    "\nSee CONVENTIONS.md for documented exceptions.",
  );
  process.exit(1);
}

console.log("✅ Response helpers: all API routes use jsonSuccess/jsonError.");
