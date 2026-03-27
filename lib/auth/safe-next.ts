export function getSafeNextPath(next: string | null) {
  if (!next) {
    return "/dashboard";
  }

  // Prevent header injection and malformed redirect values.
  if (/[\u0000-\u001F\u007F]/.test(next) || next.includes("\\") || next.startsWith("//")) {
    return "/dashboard";
  }
  try {
    const decoded = decodeURIComponent(next);
    if (decoded.includes("\\") || decoded.startsWith("//") || decoded.startsWith("/\\")) {
      return "/dashboard";
    }
  } catch {
    return "/dashboard";
  }

  try {
    const parsed = new URL(next, "http://localhost");
    if (parsed.origin !== "http://localhost" || !parsed.pathname.startsWith("/")) {
      return "/dashboard";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}
