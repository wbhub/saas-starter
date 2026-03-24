/**
 * CI check: Ensures team API routes use withTeamRoute or withAuthedRoute
 * instead of manually calling verifyCsrfProtection + createClient + getCachedTeamContextForUser.
 * Run with: npx tsx scripts/check-route-wrappers.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TEAM_DIR = join(ROOT, "app", "api", "team");

function walk(dir: string): string[] {
  const results: string[] = [];
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return results;
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

const files = walk(TEAM_DIR);
const violations: string[] = [];

for (const fullPath of files) {
  const relPath = relative(ROOT, fullPath);
  if (relPath.endsWith(".test.ts")) continue;

  const content = readFileSync(fullPath, "utf8");
  const hasManualCsrf = content.includes("verifyCsrfProtection");
  const hasWrapper = content.includes("withTeamRoute") || content.includes("withAuthedRoute");

  if (hasManualCsrf && !hasWrapper) {
    violations.push(relPath);
  }
}

if (violations.length > 0) {
  console.error("❌ Team routes using manual CSRF pipeline without withTeamRoute/withAuthedRoute:");
  for (const file of violations) {
    console.error(`   ${file}`);
  }
  console.error(
    "\nTeam-scoped routes should use withTeamRoute; auth-only routes should use withAuthedRoute.",
    "\nSee CONVENTIONS.md for details.",
  );
  process.exit(1);
}

console.log("✅ Route wrappers: all team routes use withTeamRoute or withAuthedRoute.");
