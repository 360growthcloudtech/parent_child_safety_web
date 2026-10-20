import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";
import { sendPush } from "@/lib/fcm";
import { logEvent } from "@/lib/events";
import { owners } from "@/lib/liveStore";

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
 * POST: Parent requests an on-demand snapshot (camera or screen).
 * Body: { "source": "camera" | "screen" }
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/devices/[deviceId]/snapshot-request">,
) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const { deviceId } = await ctx.params;
  if ((await ownerOf(deviceId)) !== email) {
    return Response.json({ ok: false, error: "not your device" }, { status: 404 });
  }

  let body: { source?: string };
  try {
    body = await request.json();
  } catch {
    body = { source: "camera" };
  }

  const source = body.source === "screen" ? "screen" : "camera";

  try {
    const { rows } = await query<{ fcm_token: string | null; camera_facing: string }>(
      `update devices
          set snapshot_requested = $3
        where id = $1 and owner_email = $2
        returning fcm_token, camera_facing`,
      [deviceId, email, source],
    );

    if (rows.length === 0) {
      return Response.json({ ok: false, error: "device not found" }, { status: 404 });
    }

    const dev = rows[0];

    await logEvent(
      email,
      deviceId,
      "snapshot_requested",
      `Requested on-demand ${source} snapshot`,
    );

    if (dev.fcm_token) {
      const baseUrl =
        process.env.PUBLIC_BASE_URL ?? new URL(request.url).origin;
      await sendPush(dev.fcm_token, {
        action: "snapshot",
        baseUrl,
        token: process.env.INGEST_TOKEN ?? "",
        deviceId,
        source,
        facing: dev.camera_facing || "front",
      });
    }

    return Response.json({ ok: true, source });
  } catch (error) {
    console.error("Failed to request snapshot:", error);
    return Response.json({ ok: false, error: "request failed" }, { status: 500 });
  }
}
