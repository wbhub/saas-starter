import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/security/csrf";

function readCookie(name: string) {
  if (typeof document === "undefined") {
    return "";
  }

  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!cookie) {
    return "";
  }

  const rawValue = cookie.slice(name.length + 1);
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export function getCsrfHeaders() {
  const token = readCookie(CSRF_COOKIE_NAME);
  if (!token) {
    return {};
  }

  return { [CSRF_HEADER_NAME]: token };
}
