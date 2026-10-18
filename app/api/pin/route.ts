import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";
import { hashPin } from "@/lib/pin";

/** Whether the logged-in parent has an admin PIN set. */
export async function GET() {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const { rows } = await query(
    `select 1 from account_pins where email = $1`,
    [email],
  );
  return Response.json({ ok: true, hasPin: rows.length > 0 });
}

/** Sets or changes the logged-in parent's admin PIN. Body: { "pin": "1234" } */
export async function POST(request: Request) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  let body: { pin?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const pin = (body.pin ?? "").trim();
  if (!/^\d{4,8}$/.test(pin)) {
    return Response.json(
      { ok: false, error: "PIN must be 4-8 digits" },
      { status: 400 },
    );
  }
  try {
    await query(
      `insert into account_pins (email, pin_hash, updated_at)
       values ($1, $2, now())
       on conflict (email) do update
         set pin_hash = excluded.pin_hash, updated_at = now()`,
      [email, hashPin(pin)],
    );
    return Response.json({ ok: true });
  } catch (error) {
    console.error("set pin failed:", error);
    return Response.json({ ok: false, error: "save failed" }, { status: 500 });
  }
}
