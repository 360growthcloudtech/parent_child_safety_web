import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";
import { frames, screenFrames, owners } from "@/lib/liveStore";
import { logEvent } from "@/lib/events";

async function ownerOf(deviceId: string): Promise<string | null> {
  const cached = owners.get(deviceId);
  if (cached) return cached;
  const { rows } = await query<{ owner_email: string }>(
    `select owner_email from devices where id = $1`,
    [deviceId],
  );
  const owner = rows[0]?.owner_email ?? null;
  if (owner) owners.set(deviceId, owner);
  return owner;
}

/**
 * GET: Lists saved snapshots for a device (metadata only, newest first).
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/devices/[deviceId]/snapshots">,
) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const { deviceId } = await ctx.params;
  if ((await ownerOf(deviceId)) !== email) {
    return Response.json({ ok: false, error: "not your device" }, { status: 404 });
  }

  try {
    const { rows } = await query<{
      id: string;
      device_id: string;
      source: string;
      mime: string;
      created_at: string;
      size: number;
    }>(
      `select id, device_id, source, mime, created_at, octet_length(image) as size
         from snapshots
        where device_id = $1 and owner_email = $2
        order by created_at desc
        limit 100`,
      [deviceId, email],
    );

    return Response.json({ ok: true, snapshots: rows });
  } catch (error) {
    console.error("Failed to list snapshots:", error);
    return Response.json({ ok: false, error: "query failed" }, { status: 500 });
  }
}

/**
 * POST: Saves a snapshot into the gallery.
 * Either takes the live frame from liveStore ({ source: 'camera' | 'screen' }),
 * or accepts a custom base64 image ({ source, image: base64, mime }).
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/devices/[deviceId]/snapshots">,
) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const { deviceId } = await ctx.params;
  if ((await ownerOf(deviceId)) !== email) {
    return Response.json({ ok: false, error: "not your device" }, { status: 404 });
  }

  let body: { source?: string; image?: string; mime?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const source = body.source === "screen" ? "screen" : "camera";
  let imageBuffer: Buffer | null = null;
  let mimeType = body.mime || "image/jpeg";

  if (body.image) {
    try {
      imageBuffer = Buffer.from(body.image, "base64");
    } catch {
      return Response.json({ ok: false, error: "invalid base64 image" }, { status: 400 });
    }
  } else {
    // Grab latest live frame from in-memory store
    const liveMedia = source === "screen" ? screenFrames.get(deviceId) : frames.get(deviceId);
    if (!liveMedia || !liveMedia.data) {
      return Response.json(
        { ok: false, error: `No active ${source} live frame available to snapshot.` },
        { status: 404 },
      );
    }
    imageBuffer = liveMedia.data;
    mimeType = liveMedia.mime || mimeType;
  }

  try {
    const { rows } = await query<{ id: string; created_at: string }>(
      `insert into snapshots (device_id, owner_email, source, image, mime)
       values ($1, $2, $3, $4, $5)
       returning id, created_at`,
      [deviceId, email, source, imageBuffer, mimeType],
    );

    const snapshot = rows[0];

    await logEvent(
      email,
      deviceId,
      "snapshot_saved",
      `Saved ${source} snapshot to gallery`,
    );

    return Response.json({
      ok: true,
      snapshot: {
        id: snapshot.id,
        device_id: deviceId,
        source,
        mime: mimeType,
        created_at: snapshot.created_at,
      },
    });
  } catch (error) {
    console.error("Failed to save snapshot:", error);
    return Response.json({ ok: false, error: "insert failed" }, { status: 500 });
  }
}
