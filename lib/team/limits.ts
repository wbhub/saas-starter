import { env } from "@/lib/env";

const DEFAULT_TEAM_MAX_MEMBERS = 100;

export function getTeamMaxMembers() {
  const raw = env.TEAM_MAX_MEMBERS;
  if (!raw) {
    return DEFAULT_TEAM_MAX_MEMBERS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_TEAM_MAX_MEMBERS;
  }

  return Math.floor(parsed);
}
