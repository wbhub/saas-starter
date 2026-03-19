import { createHmac } from "crypto";

export function signIntercomUserId(userId: string, secret: string) {
  return createHmac("sha256", secret).update(userId).digest("hex");
}

