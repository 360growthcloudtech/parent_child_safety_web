import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";
import { sendPush } from "@/lib/fcm";
import { logEvent } from "@/lib/events";
import { removeDeviceFromMemory } from "@/lib/liveStore";

/**
 * DELETE: Permanently delete a device and all associated data.
 * Automatically cascades to frames, audio_clips, app_activity, call_logs, and snapshots.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/devices/[deviceId]">,
) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const { deviceId } = await ctx.params;

  try {
    const { rows } = await query<{ owner_email: string; fcm_token: string | null; name: string }>(
      `select owner_email, fcm_token, name from devices where id = $1`,
      [deviceId],
    );

    if (rows.length === 0 || rows[0].owner_email !== email) {
      return Response.json({ ok: false, error: "device not found" }, { status: 404 });
    }

    const dev = rows[0];

    // Inform child app to unpair and reset if it is currently listening
    if (dev.fcm_token) {
      try {
        await sendPush(dev.fcm_token, {
          action: "unpair",
          deviceId,
        });
      } catch (pushErr) {
        console.warn("Failed to send unpair push:", pushErr);
      }
    }

    // Delete device from Postgres (cascades to frames, audio_clips, app_activity, call_logs, snapshots)
    await query(`delete from events where device_id = $1`, [deviceId]);
    await query(`delete from pairing_codes where device_id = $1`, [deviceId]);
    await query(`delete from devices where id = $1 and owner_email = $2`, [deviceId, email]);

    // Clear server memory caches
    removeDeviceFromMemory(deviceId);

    await logEvent(email, deviceId, "device_deleted", `Device '${dev.name}' was permanently removed.`);

    return Response.json({ ok: true, deletedId: deviceId });
  } catch (error) {
    console.error("Failed to delete device:", error);
    return Response.json({ ok: false, error: "failed to delete device" }, { status: 500 });
  }
}
