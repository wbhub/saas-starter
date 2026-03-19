import { NextRequest, NextResponse } from "next/server";
import { requireJsonContentType } from "@/lib/http/content-type";
import { createClient } from "@/lib/supabase/server";

const PASSWORD_RECOVERY_COOKIE = "auth_password_recovery";
const PASSWORD_RECOVERY_USER_COOKIE = "auth_password_recovery_user";

type ResetPasswordPayload = {
  password?: string;
};

export async function POST(request: NextRequest) {
  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const body = (await request.json().catch(() => null)) as ResetPasswordPayload | null;
  const password = body?.password ?? "";
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const hasRecoveryProof = request.cookies.get(PASSWORD_RECOVERY_COOKIE)?.value === "1";
  const recoveryUserId = request.cookies.get(PASSWORD_RECOVERY_USER_COOKIE)?.value ?? "";
  if (!hasRecoveryProof || !recoveryUserId) {
    return NextResponse.json(
      { error: "Reset link is invalid or expired. Please request a new link." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== recoveryUserId) {
    return NextResponse.json(
      { error: "Reset link is invalid or expired. Please request a new link." },
      { status: 403 },
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  const secure = request.nextUrl.protocol === "https:";
  response.cookies.set({
    name: PASSWORD_RECOVERY_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/reset-password",
    maxAge: 0,
  });
  response.cookies.set({
    name: PASSWORD_RECOVERY_USER_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/reset-password",
    maxAge: 0,
  });

  return response;
}
