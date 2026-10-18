import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";
import { audio, audioQueues, owners } from "@/lib/liveStore";

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

/** Returns the next queued or latest in-memory ambient-audio clip for the parent's device. */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/audio/[deviceId]">,
) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const { deviceId } = await ctx.params;

  if ((await ownerOf(deviceId)) !== email) {
    return Response.json({ ok: false, error: "not your device" }, { status: 404 });
  }

  const now = Date.now();
  const MAX_STALE_MS = 6000; // Live audio must be younger than 6 seconds

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? parseInt(sinceParam, 10) : null;

  const queue = audioQueues.get(deviceId);

  if (since !== null && !isNaN(since) && since > 0) {
    if (queue && queue.length > 0) {
      // Find the next sequential chunk that is newer than `since` and captured recently
      const nextChunk = queue.find((c) => c.seq > since && now - c.at < MAX_STALE_MS);
      if (nextChunk) {
        return new Response(new Uint8Array(nextChunk.data), {
          headers: {
            "Content-Type": nextChunk.mime,
            "Cache-Control": "no-store",
            "X-Audio-Seq": nextChunk.seq.toString(),
            "X-Captured-At": new Date(nextChunk.at).toISOString(),
          },
        });
      }
    }
    // No new fresh chunk available yet
    return new Response(null, { status: 204 });
  }

  // Initial call (since=0 or not provided): only return if the latest chunk is FRESH (< 6s old)
  if (queue && queue.length > 0) {
    const latest = queue[queue.length - 1];
    if (now - latest.at < MAX_STALE_MS) {
      return new Response(new Uint8Array(latest.data), {
        headers: {
          "Content-Type": latest.mime,
          "Cache-Control": "no-store",
          "X-Audio-Seq": latest.seq.toString(),
          "X-Captured-At": new Date(latest.at).toISOString(),
        },
      });
    }
  }

  // No fresh live audio available right now
  return new Response(null, { status: 204 });
}
