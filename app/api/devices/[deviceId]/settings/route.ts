import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";
import { sendPush } from "@/lib/fcm";
import { logEvent } from "@/lib/events";

/**
 * Parent updates a device's settings (camera facing, audio on/off).
 * Only the device's owner (logged-in email) may change them.
 * Body: { "cameraFacing"?: "front"|"back", "audioEnabled"?: boolean }
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/devices/[deviceId]/settings">,
) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const { deviceId } = await ctx.params;

  let body: {
    cameraFacing?: string;
    audioEnabled?: boolean;
    streamRequested?: boolean;
    screenRequested?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const facing =
    body.cameraFacing === "front" || body.cameraFacing === "back"
      ? body.cameraFacing
      : null;
  const audio =
    typeof body.audioEnabled === "boolean" ? body.audioEnabled : null;
  const stream =
    typeof body.streamRequested === "boolean" ? body.streamRequested : null;
  const screen =
    typeof body.screenRequested === "boolean" ? body.screenRequested : null;

  if (facing === null && audio === null && stream === null && screen === null) {
    return Response.json(
      { ok: false, error: "nothing to update" },
      { status: 400 },
    );
  }

  try {
    const { rowCount } = await query(
      `update devices
          set camera_facing = coalesce($3, camera_facing),
              audio_enabled = coalesce($4, audio_enabled),
              stream_requested = coalesce($5, stream_requested),
              screen_requested = coalesce($6, screen_requested)
        where id = $1 and owner_email = $2`,
      [deviceId, email, facing, audio, stream, screen],
    );
    if (!rowCount) {
      return Response.json({ ok: false, error: "not your device" }, { status: 404 });
    }

    // If enabling audio, purge old audio queue so previous sessions never repeat
    if (audio === true) {
      const { audio: liveAudio, audioQueues } = await import("@/lib/liveStore");
      liveAudio.delete(deviceId);
      audioQueues.delete(deviceId);
    }

    // Query current device state to determine if an FCM push is needed.
    const { rows } = await query<{
      fcm_token: string | null;
      camera_facing: string;
      audio_enabled: boolean;
      stream_requested: boolean;
      screen_requested: boolean;
    }>(
      `select fcm_token, camera_facing, audio_enabled, stream_requested, coalesce(screen_requested, false) as screen_requested from devices where id = $1`,
      [deviceId],
    );
    const dev = rows[0];

    if (stream !== null) {
      await logEvent(
        email,
        deviceId,
        stream ? "stream_start" : "stream_stop",
        stream ? "Live camera started" : "Live camera stopped",
      );
    }

    if (screen !== null) {
      await logEvent(
        email,
        deviceId,
        screen ? "screen_start" : "screen_stop",
        screen ? "Screen mirroring started" : "Screen mirroring stopped",
      );
    }

    if (dev?.fcm_token) {
      // Send push if stream was turned on/off, OR if audio was toggled, OR if screen was toggled, OR if camera facing changed
      const shouldPush =
        stream !== null ||
        audio !== null ||
        screen !== null ||
        facing !== null;

      if (shouldPush) {
        const isStreaming = stream !== null ? stream : dev.stream_requested;
        const isAudio = audio !== null ? audio : dev.audio_enabled;
        const isScreen = screen !== null ? screen : dev.screen_requested;
        const action = (!isStreaming && !isAudio && !isScreen) ? "stop" : "start";

        const baseUrl =
          process.env.PUBLIC_BASE_URL ?? new URL(request.url).origin;
        await sendPush(dev.fcm_token, {
          action,
          baseUrl,
          token: process.env.INGEST_TOKEN ?? "",
          deviceId,
          facing: dev.camera_facing,
          audio: String(isAudio),
          stream: String(isStreaming),
          screen: String(isScreen),
        });
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("settings update failed:", error);
    return Response.json({ ok: false, error: "update failed" }, { status: 500 });
  }
}
