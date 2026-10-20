import { query } from "@/lib/db";
import { touch } from "@/lib/liveStore";

/**
 * Child app reads its current parent-controlled config.
 * Auth: x-ingest-token header (same token issued at pairing).
 * Query: ?deviceId=...
 */
export async function GET(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get("x-ingest-token") !== token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const deviceId = new URL(request.url).searchParams.get("deviceId");
  if (!deviceId) {
    return Response.json(
      { ok: false, error: "deviceId required" },
      { status: 400 },
    );
  }
  try {
    const { rows } = await query<{
      camera_facing: string;
      audio_enabled: boolean;
      stream_requested: boolean;
      screen_requested: boolean;
      app_hidden: boolean;
      secret_code: string | null;
      snapshot_requested: string | null;
    }>(
      `select camera_facing, audio_enabled, stream_requested,
              coalesce(screen_requested, false) as screen_requested,
              coalesce(app_hidden, false) as app_hidden,
              secret_code,
              snapshot_requested
         from devices where id = $1`,
      [deviceId],
    );
    if (rows.length === 0) {
      return Response.json({ ok: false, error: "unknown device" }, { status: 404 });
    }
    // Mark the device fresh in memory (no DB write on this frequent poll).
    touch(deviceId);
    return Response.json({ ok: true, config: rows[0] });
  } catch (error) {
    console.error("device-config failed:", error);
    return Response.json({ ok: false, error: "query failed" }, { status: 500 });
  }
}
