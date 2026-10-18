import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";

export type CallLogRow = {
  id: string;
  call_id: string | null;
  caller_name: string | null;
  phone_number: string;
  call_type: "incoming" | "outgoing" | "missed" | "rejected" | string;
  duration: number;
  called_at: string;
};

/** Recent call logs (incoming/outgoing/missed) for one of the parent's devices. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/call-logs/[deviceId]">,
) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const { deviceId } = await ctx.params;
  try {
    const owns = await query(
      `select 1 from devices where id = $1 and owner_email = $2`,
      [deviceId, email],
    );
    if (owns.rows.length === 0) {
      return Response.json({ ok: false, error: "not your device" }, { status: 404 });
    }
    const { rows } = await query<CallLogRow>(
      `select id, call_id, caller_name, phone_number, call_type, duration, called_at
         from call_logs
        where device_id = $1
        order by called_at desc
        limit 150`,
      [deviceId],
    );
    return Response.json({ ok: true, calls: rows });
  } catch (error) {
    console.error("call-logs query failed:", error);
    return Response.json({ ok: false, error: "query failed" }, { status: 500 });
  }
}
