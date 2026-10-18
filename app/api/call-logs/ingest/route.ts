import { query } from "@/lib/db";

export type IngestCallItem = {
  callId: string;
  callerName?: string | null;
  phoneNumber: string;
  callType: string; // 'incoming' | 'outgoing' | 'missed' | 'rejected'
  duration: number; // in seconds
  timestamp: number; // epoch ms
};

/**
 * Child app uploads call log entries.
 * Auth: x-ingest-token.
 * Body: { deviceId: string, calls: IngestCallItem[] }
 */
export async function POST(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get("x-ingest-token") !== token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { deviceId?: string; calls?: IngestCallItem[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { deviceId, calls } = body;
  if (!deviceId || !Array.isArray(calls)) {
    return Response.json(
      { ok: false, error: "deviceId and calls array required" },
      { status: 400 },
    );
  }

  try {
    await Promise.all(
      calls
        .filter((c) => !!c.phoneNumber)
        .map((call) => {
          const callId = call.callId || `${call.phoneNumber}_${call.timestamp}`;
          const epochSec = call.timestamp ? call.timestamp / 1000 : Date.now() / 1000;
          const callerName = call.callerName?.trim() ? call.callerName.trim().slice(0, 100) : null;
          const phoneNumber = call.phoneNumber.trim().slice(0, 50);
          const callType = (call.callType || "incoming").toLowerCase().slice(0, 20);
          const duration = Math.max(0, Math.floor(Number(call.duration) || 0));

          return query(
            `insert into call_logs (device_id, call_id, caller_name, phone_number, call_type, duration, called_at)
             values ($1, $2, $3, $4, $5, $6, to_timestamp($7))
             on conflict (device_id, call_id) do update set
               caller_name = coalesce(excluded.caller_name, call_logs.caller_name),
               call_type = excluded.call_type,
               duration = excluded.duration`,
            [deviceId, callId, callerName, phoneNumber, callType, duration, epochSec],
          );
        }),
    );

    return Response.json({ ok: true, synced: calls.length });
  } catch (error) {
    console.error("call-logs ingest failed:", error);
    return Response.json({ ok: false, error: "store failed" }, { status: 500 });
  }
}
