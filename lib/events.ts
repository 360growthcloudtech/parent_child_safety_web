import { query } from "@/lib/db";

/** Records an event for the parent's notifications list (best-effort). */
export async function logEvent(
  email: string,
  deviceId: string | null,
  type: string,
  message: string,
): Promise<void> {
  try {
    await query(
      `insert into events (email, device_id, type, message)
       values ($1, $2, $3, $4)`,
      [email, deviceId, type, message],
    );
  } catch (error) {
    console.error("logEvent failed:", error);
  }
}
