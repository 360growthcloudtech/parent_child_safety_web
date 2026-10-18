import { query } from "@/lib/db";
import { normalizeEmail } from "@/lib/session";
import { verifyPin } from "@/lib/pin";

/**
 * Child app verifies the admin PIN before it is allowed to stop monitoring or
 * unpair. Body: { "email": "...", "pin": "1234" }.
 *
 * If no PIN is set for the account, returns { ok: true, hasPin: false } so the
 * app allows the action (the family hasn't opted into the lock).
 */
export async function POST(request: Request) {
  let body: { email?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  const pin = (body.pin ?? "").trim();
  if (!email) {
    return Response.json({ ok: false, error: "email required" }, { status: 400 });
  }
  try {
    const { rows } = await query<{ pin_hash: string }>(
      `select pin_hash from account_pins where email = $1`,
      [email],
    );
    if (rows.length === 0) {
      return Response.json({ ok: true, hasPin: false, valid: true });
    }
    const valid = verifyPin(pin, rows[0].pin_hash);
    return Response.json({ ok: true, hasPin: true, valid });
  } catch (error) {
    console.error("verify pin failed:", error);
    return Response.json({ ok: false, error: "verify failed" }, { status: 500 });
  }
}
