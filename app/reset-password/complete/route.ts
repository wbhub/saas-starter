import { NextRequest, NextResponse } from "next/server";

const PASSWORD_RECOVERY_COOKIE = "auth_password_recovery";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: PASSWORD_RECOVERY_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/reset-password",
    maxAge: 0,
  });

  return response;
}
