import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";

export type EventRow = {
  id: string;
  device_id: string | null;
  type: string;
  message: string;
  created_at: string;
};

/** Returns the parent's recent notifications (most recent first). */
export async function GET() {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  try {
    const { rows } = await query<EventRow>(
      `select id, device_id, type, message, created_at
         from events
        where email = $1
        order by created_at desc
        limit 50`,
      [email],
    );
    return Response.json({ ok: true, events: rows });
  } catch (error) {
    console.error("events query failed:", error);
    return Response.json({ ok: false, error: "query failed" }, { status: 500 });
  }
}
