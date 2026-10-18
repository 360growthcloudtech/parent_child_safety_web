import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";

export type ActivityRow = {
  id: string;
  app: string;
  package: string | null;
  title: string | null;
  message: string | null;
  posted_at: string;
};

/** Recent app activity and notifications for one of the parent's devices. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/app-activity/[deviceId]">,
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
    const { rows } = await query<ActivityRow>(
      `select id, app, package, title, message, posted_at
         from app_activity
        where device_id = $1
        order by posted_at desc
        limit 100`,
      [deviceId],
    );
    return Response.json({ ok: true, activity: rows });
  } catch (error) {
    console.error("app-activity query failed:", error);
    return Response.json({ ok: false, error: "query failed" }, { status: 500 });
  }
}
