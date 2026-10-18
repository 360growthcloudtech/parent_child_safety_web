import { query } from "@/lib/db";

/**
 * Child app registers its FCM token so the server can wake it for a live view.
 * Auth: x-ingest-token. Body: { "deviceId": "...", "fcmToken": "..." }
 */
export async function POST(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get("x-ingest-token") !== token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { deviceId?: string; fcmToken?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const { deviceId, fcmToken } = body;
  if (!deviceId || !fcmToken) {
    return Response.json(
      { ok: false, error: "deviceId and fcmToken required" },
      { status: 400 },
    );
  }
  try {
    await query(`update devices set fcm_token = $2 where id = $1`, [
      deviceId,
      fcmToken,
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("device-token save failed:", error);
    return Response.json({ ok: false, error: "save failed" }, { status: 500 });
  }
}
