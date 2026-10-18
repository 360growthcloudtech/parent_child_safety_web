import { audio, audioQueues, audioSeq, touch } from "@/lib/liveStore";

/**
 * Child app uploads a short ambient-audio clip (base64). Kept in server memory
 * (latest clip per device). Auth: x-ingest-token.
 * Body: { "deviceId": "...", "clip": "<base64>", "mime": "audio/mp4" }
 */
export async function POST(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get("x-ingest-token") !== token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { deviceId?: string; clip?: string; mime?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const { deviceId, clip, mime } = body;
  if (!deviceId || !clip) {
    return Response.json(
      { ok: false, error: "deviceId and clip required" },
      { status: 400 },
    );
  }

  try {
    const currentSeq = (audioSeq.get(deviceId) ?? 0) + 1;
    audioSeq.set(deviceId, currentSeq);

    const chunk = {
      seq: currentSeq,
      data: Buffer.from(clip, "base64"),
      mime: mime || "audio/wav",
      at: Date.now(),
    };

    let queue = audioQueues.get(deviceId);
    if (!queue) {
      queue = [];
      audioQueues.set(deviceId, queue);
    }
    queue.push(chunk);
    if (queue.length > 15) {
      queue.shift();
    }

    audio.set(deviceId, chunk);
    touch(deviceId);
    return Response.json({ ok: true, seq: currentSeq });
  } catch (error) {
    console.error("audio ingest failed:", error);
    return Response.json({ ok: false, error: "store failed" }, { status: 500 });
  }
}
