import { getSessionEmail } from "@/lib/session";
import { query } from "@/lib/db";

export async function GET() {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  try {
    const { rows } = await query<{ retention_days: number }>(
      `select retention_days from account_retention where email = $1`,
      [email],
    );
    const retentionDays = rows[0]?.retention_days ?? 30;
    return Response.json({ ok: true, retentionDays });
  } catch (error) {
    console.error("fetch retention failed:", error);
    return Response.json({ ok: false, error: "failed to fetch retention" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  let body: { retentionDays?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const days = Number(body.retentionDays);
  if (!days || days < 1 || days > 365) {
    return Response.json(
      { ok: false, error: "retentionDays must be between 1 and 365" },
      { status: 400 },
    );
  }

  try {
    await query(
      `insert into account_retention (email, retention_days, updated_at)
       values ($1, $2, now())
       on conflict (email)
       do update set retention_days = excluded.retention_days, updated_at = now()`,
      [email, days],
    );

    return Response.json({ ok: true, retentionDays: days });
  } catch (error) {
    console.error("update retention failed:", error);
    return Response.json({ ok: false, error: "failed to update retention" }, { status: 500 });
  }
}
