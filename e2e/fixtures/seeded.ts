export const authStatePaths = {
  owner: "e2e/.auth/owner.json",
  member: "e2e/.auth/member.json",
} as const;

export const seededUsers = {
  owner: {
    email: process.env.E2E_OWNER_EMAIL ?? "",
    password: process.env.E2E_OWNER_PASSWORD ?? "",
  },
  member: {
    email: process.env.E2E_MEMBER_EMAIL ?? "",
    password: process.env.E2E_MEMBER_PASSWORD ?? "",
  },
};

export const seededInvite = {
  token: process.env.E2E_INVITE_TOKEN ?? "seeded-invite-token",
};

export function missingSeededAuthEnvVars() {
  const missing: string[] = [];
  if (!seededUsers.owner.email) missing.push("E2E_OWNER_EMAIL");
  if (!seededUsers.owner.password) missing.push("E2E_OWNER_PASSWORD");
  if (!seededUsers.member.email) missing.push("E2E_MEMBER_EMAIL");
  if (!seededUsers.member.password) missing.push("E2E_MEMBER_PASSWORD");
  return missing;
}

export function hasSeededOwner() {
  return Boolean(seededUsers.owner.email && seededUsers.owner.password);
}

export function hasSeededMember() {
  return Boolean(seededUsers.member.email && seededUsers.member.password);
}
