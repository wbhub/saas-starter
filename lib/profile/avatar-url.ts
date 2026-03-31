import { env } from "@/lib/env";

export function getSupabaseStorageOrigin(): string | null {
  try {
    return new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin;
  } catch {
    return null;
  }
}

export function extractProfilePhotoPath(url: string, expectedStorageOrigin: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== expectedStorageOrigin) {
      return null;
    }

    const match = parsed.pathname.match(
      /^\/storage\/v1\/object\/(?:public|sign)\/profile-photos\/(.+)$/,
    );
    if (!match?.[1]) {
      return null;
    }

    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function isOwnedProfilePhotoPath(profilePhotoPath: string, userId: string): boolean {
  const pathSegments = profilePhotoPath.split("/").filter((segment) => segment.length > 0);
  if (pathSegments.length < 2) {
    return false;
  }

  if (pathSegments.some((segment) => segment === "." || segment === "..")) {
    return false;
  }

  return pathSegments[0] === userId;
}

export function isAllowedAvatarUrl(
  url: string,
  expectedStorageOrigin: string,
  userId: string,
): boolean {
  const profilePhotoPath = extractProfilePhotoPath(url, expectedStorageOrigin);
  if (!profilePhotoPath) {
    return false;
  }

  return isOwnedProfilePhotoPath(profilePhotoPath, userId);
}
