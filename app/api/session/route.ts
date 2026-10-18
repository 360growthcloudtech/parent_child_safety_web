import {
  clearSession,
  getSessionEmail,
  normalizeEmail,
  setSessionEmail,
} from "@/lib/session";

/** Returns the currently logged-in parent email, if any. */
export async function GET() {
  const email = await getSessionEmail();
  return Response.json({ ok: true, email });
}

/**
 * Logs in with an email.
 *
 * This is a lightweight prototype login: it trusts the email and issues a
 * signed session cookie. For production, replace this with a verified login
 * (magic link, OAuth, or password) so only the real owner of the email can
 * sign in.
 */
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  if (!email) {
    return Response.json(
      { ok: false, error: "valid email required" },
      { status: 400 },
    );
  }
  await setSessionEmail(email);
  return Response.json({ ok: true, email });
}

/** Logs out. */
export async function DELETE() {
  await clearSession();
  return Response.json({ ok: true });
}
