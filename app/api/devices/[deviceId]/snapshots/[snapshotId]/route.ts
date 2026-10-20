import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";
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
 * GET: Serves the binary image file of a snapshot.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/devices/[deviceId]/snapshots/[snapshotId]">,
) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const { deviceId, snapshotId } = await ctx.params;
  if ((await ownerOf(deviceId)) !== email) {
    return Response.json({ ok: false, error: "not your device" }, { status: 404 });
  }

  try {
    const { rows } = await query<{ image: Buffer; mime: string; created_at: string }>(
      `select image, mime, created_at from snapshots where id = $1 and device_id = $2 and owner_email = $3`,
      [snapshotId, deviceId, email],
    );
    if (rows.length === 0) {
      return Response.json({ ok: false, error: "snapshot not found" }, { status: 404 });
    }

    const { image, mime, created_at } = rows[0];
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": mime || "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Captured-At": new Date(created_at).toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to load snapshot image:", error);
    return Response.json({ ok: false, error: "load failed" }, { status: 500 });
  }
}

/**
 * DELETE: Deletes a snapshot.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/devices/[deviceId]/snapshots/[snapshotId]">,
) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const { deviceId, snapshotId } = await ctx.params;
  if ((await ownerOf(deviceId)) !== email) {
    return Response.json({ ok: false, error: "not your device" }, { status: 404 });
  }

  try {
    const { rowCount } = await query(
      `delete from snapshots where id = $1 and device_id = $2 and owner_email = $3`,
      [snapshotId, deviceId, email],
    );
    if (!rowCount) {
      return Response.json({ ok: false, error: "snapshot not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete snapshot:", error);
    return Response.json({ ok: false, error: "delete failed" }, { status: 500 });
  }
}
