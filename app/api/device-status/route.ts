import { query } from "@/lib/db";
import { touch } from "@/lib/liveStore";

/**
 * Child app reports device status (battery / network).
 * Auth: x-ingest-token.
 * Body: { "deviceId": "...", "battery": 82, "charging": true, "network": "wifi" }
 */
export async function POST(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get("x-ingest-token") !== token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: {
    deviceId?: string;
    battery?: number;
    charging?: boolean;
    network?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const { deviceId, battery, charging, network } = body;
  if (!deviceId) {
    return Response.json(
      { ok: false, error: "deviceId required" },
      { status: 400 },
    );
  }
  try {
    await query(
      `update devices
          set battery = $2, charging = $3, network = $4, last_seen = now()
        where id = $1`,
      [
        deviceId,
        typeof battery === "number" ? battery : null,
        typeof charging === "boolean" ? charging : null,
        network ?? null,
      ],
    );
    touch(deviceId);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("device-status failed:", error);
    return Response.json({ ok: false, error: "store failed" }, { status: 500 });
  }
}
