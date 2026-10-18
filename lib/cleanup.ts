import { query } from "@/lib/db";

export interface CleanupResult {
  deletedEvents: number;
  deletedActivity: number;
  deletedCalls: number;
  deletedPairingCodes: number;
  retentionDaysUsed: number;
}

/**
 * Cleans up data older than retentionDays.
 * If ownerEmail is provided, cleans up data for that parent.
 * If ownerEmail is omitted, cleans up data system-wide for all parents based on their configured retention days (or 30 days default).
 */
export async function performCleanup(
  ownerEmail?: string,
): Promise<CleanupResult> {
  // 1. Delete expired pairing codes
  const { rowCount: deletedPairingCodes } = await query(
    `delete from pairing_codes where expires_at < now()`,
  );

  if (ownerEmail) {
    const { rows: retRows } = await query<{ retention_days: number }>(
      `select retention_days from account_retention where email = $1`,
      [ownerEmail],
    );
    const days = retRows[0]?.retention_days ?? 30;

    // Delete events for this parent older than `days`
    const { rowCount: deletedEvents } = await query(
      `delete from events 
        where email = $1 
          and created_at < now() - ($2 || ' days')::interval`,
      [ownerEmail, days],
    );

    // Delete app_activity (notifications) for this parent's devices older than `days`
    const { rowCount: deletedActivity } = await query(
      `delete from app_activity 
        where device_id in (select id from devices where owner_email = $1)
          and posted_at < now() - ($2 || ' days')::interval`,
      [ownerEmail, days],
    );

    // Delete call_logs for this parent's devices older than `days`
    const { rowCount: deletedCalls } = await query(
      `delete from call_logs 
        where device_id in (select id from devices where owner_email = $1)
          and called_at < now() - ($2 || ' days')::interval`,
      [ownerEmail, days],
    );

    return {
      deletedEvents: deletedEvents || 0,
      deletedActivity: deletedActivity || 0,
      deletedCalls: deletedCalls || 0,
      deletedPairingCodes: deletedPairingCodes || 0,
      retentionDaysUsed: days,
    };
  } else {
    // System-wide cleanup across all accounts based on each parent's retention_days (or default 30)
    // 1. Delete events older than each parent's retention_days
    const { rowCount: deletedEvents } = await query(
      `delete from events e
        where e.created_at < now() - (
          coalesce(
            (select retention_days from account_retention ar where ar.email = e.email),
            30
          ) || ' days'
        )::interval`,
    );

    // 2. Delete app_activity older than each device's parent's retention_days
    const { rowCount: deletedActivity } = await query(
      `delete from app_activity a
        where a.posted_at < now() - (
          coalesce(
            (select ar.retention_days 
               from devices d 
               join account_retention ar on ar.email = d.owner_email 
              where d.id = a.device_id),
            30
          ) || ' days'
        )::interval`,
    );

    // 3. Delete call_logs older than each device's parent's retention_days
    const { rowCount: deletedCalls } = await query(
      `delete from call_logs c
        where c.called_at < now() - (
          coalesce(
            (select ar.retention_days 
               from devices d 
               join account_retention ar on ar.email = d.owner_email 
              where d.id = c.device_id),
            30
          ) || ' days'
        )::interval`,
    );

    return {
      deletedEvents: deletedEvents || 0,
      deletedActivity: deletedActivity || 0,
      deletedCalls: deletedCalls || 0,
      deletedPairingCodes: deletedPairingCodes || 0,
      retentionDaysUsed: 30,
    };
  }
}
