import { query } from "@/lib/db";

/**
 * Child app reports notifications (app name, title, message text, package name).
 * Auth: x-ingest-token. Body: { "deviceId": "...", "app": "WhatsApp", "package": "com.whatsapp", "title": "Alice", "message": "Hey!" }
 */
export async function POST(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get("x-ingest-token") !== token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: {
    deviceId?: string;
    app?: string;
    package?: string;
    title?: string;
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const { deviceId, app } = body;
  if (!deviceId || !app) {
    return Response.json(
      { ok: false, error: "deviceId and app required" },
      { status: 400 },
    );
  }
  try {
    await query(
      `insert into app_activity (device_id, app, package, title, message) values ($1, $2, $3, $4, $5)`,
      [
        deviceId,
        app.slice(0, 100),
        body.package?.slice(0, 200) ?? null,
        body.title ? body.title.slice(0, 500) : null,
        body.message ? body.message.slice(0, 4000) : null,
      ],
    );
    return Response.json({ ok: true });
  } catch (error) {
    console.error("notif-ingest failed:", error);
    return Response.json({ ok: false, error: "store failed" }, { status: 500 });
  }
}
