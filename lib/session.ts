import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "cs_session";
const secret = process.env.SESSION_SECRET ?? "dev-insecure-session-secret";

function sign(email: string): string {
  const mac = createHmac("sha256", secret).update(email).digest("base64url");
  return `${Buffer.from(email).toString("base64url")}.${mac}`;
}

function verify(value: string | undefined): string | null {
  if (!value) return null;
  const [emailPart, mac] = value.split(".");
  if (!emailPart || !mac) return null;
  let email: string;
  try {
    email = Buffer.from(emailPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret)
    .update(email)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return email;
}

/** Reads the logged-in parent email from the session cookie, or null. */
export async function getSessionEmail(): Promise<string | null> {
  const store = await cookies();
  return verify(store.get(COOKIE)?.value);
}

export async function setSessionEmail(email: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, sign(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  // Simple shape check; real auth would verify ownership via a magic link.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return email;
}
