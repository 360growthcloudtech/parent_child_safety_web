import { query } from "@/lib/db";
import { touch } from "@/lib/liveStore";
import { logEvent } from "@/lib/events";

/**
 * Child device uploads an on-demand snapshot directly.
 * Auth: header `x-ingest-token` matching INGEST_TOKEN env var.
 * Body (JSON): { deviceId, image: "<base64>", source: "camera" | "screen", mime?: "image/jpeg" }
 */
export async function POST(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get("x-ingest-token") !== token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { deviceId?: string; image?: string; source?: string; mime?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { deviceId, image } = body;
  const source = body.source === "screen" ? "screen" : "camera";
  const mime = body.mime || "image/jpeg";

  if (!deviceId || !image) {
    return Response.json(
      { ok: false, error: "deviceId and image are required" },
      { status: 400 },
    );
  }

  try {
    const { rows: devRows } = await query<{ owner_email: string }>(
      `select owner_email from devices where id = $1`,
      [deviceId],
    );

    if (devRows.length === 0 || !devRows[0].owner_email) {
      return Response.json({ ok: false, error: "unknown device" }, { status: 404 });
    }

    const email = devRows[0].owner_email;
    const imageBuffer = Buffer.from(image, "base64");

    const { rows: snapRows } = await query<{ id: string; created_at: string }>(
      `insert into snapshots (device_id, owner_email, source, image, mime)
       values ($1, $2, $3, $4, $5)
       returning id, created_at`,
      [deviceId, email, source, imageBuffer, mime],
    );

    // Clear snapshot_requested flag on device
    await query(
      `update devices set snapshot_requested = null where id = $1`,
      [deviceId],
    );

    touch(deviceId);

    await logEvent(
      email,
      deviceId,
      "snapshot_received",
      `New ${source} snapshot captured and saved to gallery`,
    );

    return Response.json({
      ok: true,
      snapshotId: snapRows[0]?.id,
    });
  } catch (error) {
    console.error("Snapshot ingest failed:", error);
    return Response.json({ ok: false, error: "store failed" }, { status: 500 });
  }
}
