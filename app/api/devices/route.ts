import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";
import { frames, screenFrames, lastSeen, owners } from "@/lib/liveStore";

export type DeviceRow = {
  id: string;
  name: string;
  monitoring: boolean;
  last_seen: string;
  has_frame: boolean;
  frame_at: string | null;
  has_screen: boolean;
  screen_at: string | null;
  camera_facing: string;
  audio_enabled: boolean;
  stream_requested: boolean;
  screen_requested: boolean;
  battery: number | null;
  charging: boolean | null;
  network: string | null;
};

type DbRow = Omit<DeviceRow, "has_frame" | "frame_at"> & { last_seen: string };

/** Lists the logged-in parent's child devices, merged with live media state. */
export async function GET() {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  try {
    const { rows } = await query<DbRow>(
      `select d.id,
              d.name,
              d.monitoring,
              d.last_seen,
              d.camera_facing,
              d.audio_enabled,
              d.stream_requested,
              coalesce(d.screen_requested, false) as screen_requested,
              d.battery,
              d.charging,
              d.network
         from devices d
        where d.owner_email = $1
        order by d.last_seen desc`,
      [email],
    );

    // Merge the high-frequency live state (frames, freshness) from memory.
    const devices: DeviceRow[] = rows.map((d) => {
      owners.set(d.id, email);
      const frame = frames.get(d.id);
      const screenFrame = screenFrames.get(d.id);
      const seen = lastSeen.get(d.id);
      const lastSeenIso =
        seen && seen > new Date(d.last_seen).getTime()
          ? new Date(seen).toISOString()
          : d.last_seen;
      return {
        ...d,
        last_seen: lastSeenIso,
        has_frame: !!frame,
        frame_at: frame ? new Date(frame.at).toISOString() : null,
        has_screen: !!screenFrame,
        screen_at: screenFrame ? new Date(screenFrame.at).toISOString() : null,
      };
    });
    return Response.json({ ok: true, devices });
  } catch (error) {
    console.error("Listing devices failed:", error);
    return Response.json(
      { ok: false, error: "query failed" },
      { status: 500 },
    );
  }
}
