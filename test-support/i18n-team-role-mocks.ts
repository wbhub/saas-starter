/**
 * English labels for team role keys in next-intl test mocks.
 * Matches the intent of `Common.teamRoles` in `messages/en.json`.
 */
export const mockCommonTeamRolesRootKeys: Record<string, string> = {
  "Common.teamRoles.owner": "Owner",
  "Common.teamRoles.admin": "Admin",
  "Common.teamRoles.member": "Member",
};

/** Keys used with `useTranslations("Common")` (namespace-relative paths). */
export const mockCommonTeamRolesNamespacedKeys: Record<string, string> = {
  "teamRoles.owner": "Owner",
  "teamRoles.admin": "Admin",
  "teamRoles.member": "Member",
};
