import { query } from "@/lib/db";
import { normalizeEmail } from "@/lib/session";
import { logEvent } from "@/lib/events";

/**
 * Child app claims the account's reusable 6-digit pairing code.
 *
 * Body: { "code": "123456", "deviceId": "...", "email": "...", "name": "..." }
 *
 * The same code can pair many devices. The app logs in with the SAME email the
 * parent uses; the claim succeeds only when that email owns the code. Each
 * device is stored separately (by deviceId) so the dashboard lists them
 * individually.
 */
export async function POST(request: Request) {
  let body: { code?: string; deviceId?: string; name?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const code = (body.code ?? "").trim();
  const { deviceId, name } = body;
  const email = normalizeEmail(body.email);
  if (!/^\d{6}$/.test(code) || !deviceId || !email) {
    return Response.json(
      { ok: false, error: "valid 6-digit code, deviceId and email required" },
      { status: 400 },
    );
  }

  try {
    // The code must belong to this email's account.
    const { rows } = await query<{ email: string }>(
      `select email from account_codes where code = $1 and email = $2`,
      [code, email],
    );
    if (rows.length === 0) {
      return Response.json(
        { ok: false, error: "invalid code for this email" },
        { status: 400 },
      );
    }

    await query(
      `insert into devices (id, name, owner_email, monitoring, last_seen)
       values ($1, coalesce($2, 'Child device'), $3, false, now())
       on conflict (id) do update
         set owner_email = excluded.owner_email,
             name = coalesce($2, devices.name),
             last_seen = now()`,
      [deviceId, name ?? null, email],
    );

    await logEvent(
      email,
      deviceId,
      "paired",
      `Device paired: ${name ?? "Child device"}`,
    );

    return Response.json({
      ok: true,
      deviceId,
      ownerEmail: email,
      ingestToken: process.env.INGEST_TOKEN ?? null,
    });
  } catch (error) {
    console.error("Claiming pairing code failed:", error);
    return Response.json({ ok: false, error: "claim failed" }, { status: 500 });
  }
}
