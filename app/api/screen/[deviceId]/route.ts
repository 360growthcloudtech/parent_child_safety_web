import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";
import { screenFrames, owners } from "@/lib/liveStore";

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

/** Returns the latest in-memory screen frame for one of the parent's devices. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/screen/[deviceId]">,
) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const { deviceId } = await ctx.params;

  if ((await ownerOf(deviceId)) !== email) {
    return Response.json({ ok: false, error: "not your device" }, { status: 404 });
  }

  const frame = screenFrames.get(deviceId);
  if (!frame) {
    return Response.json({ ok: false, error: "no frame" }, { status: 404 });
  }
  return new Response(new Uint8Array(frame.data), {
    headers: {
      "Content-Type": frame.mime,
      "Cache-Control": "no-store",
      "X-Captured-At": new Date(frame.at).toISOString(),
    },
  });
}
