import { screenFrames, touch } from "@/lib/liveStore";

/**
 * Child-device → dashboard screen mirroring frame upload.
 *
 * Body (JSON):
 *   { "deviceId": "...", "image": "<base64 jpeg>", "mime": "image/jpeg" }
 * Auth: header `x-ingest-token` matching the INGEST_TOKEN env var.
 */
export async function POST(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get("x-ingest-token") !== token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { deviceId?: string; image?: string; mime?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { deviceId, image, mime } = body;
  if (!deviceId || !image) {
    return Response.json(
      { ok: false, error: "deviceId and image are required" },
      { status: 400 },
    );
  }

  try {
    screenFrames.set(deviceId, {
      data: Buffer.from(image, "base64"),
      mime: mime || "image/jpeg",
      at: Date.now(),
    });
    touch(deviceId);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Screen frame ingest failed:", error);
    return Response.json({ ok: false, error: "store failed" }, { status: 500 });
  }
}
