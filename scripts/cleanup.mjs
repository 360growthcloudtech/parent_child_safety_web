// Cleans up database records older than each parent's configured retention days (default: 30 days).
// Run with: node --env-file=.env.local scripts/cleanup.mjs
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`[${new Date().toISOString()}] Starting 12:00 AM midnight cleanup...`);

  // 1. Delete expired pairing codes
  const { rowCount: deletedPairingCodes } = await client.query(
    `delete from pairing_codes where expires_at < now()`,
  );

  // 2. Delete events older than each parent's retention_days (or 30 days default)
  const { rowCount: deletedEvents } = await client.query(
    `delete from events e
      where e.created_at < now() - (
        coalesce(
          (select retention_days from account_retention ar where ar.email = e.email),
          30
        ) || ' days'
      )::interval`,
  );

  // 3. Delete app_activity older than each device's parent's retention_days (or 30 days default)
  const { rowCount: deletedActivity } = await client.query(
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

  // 4. Delete call_logs older than each device's parent's retention_days (or 30 days default)
  const { rowCount: deletedCalls } = await client.query(
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

  console.log(`[Cleanup Complete]:`, {
    deletedEvents: deletedEvents || 0,
    deletedActivity: deletedActivity || 0,
    deletedCalls: deletedCalls || 0,
    deletedPairingCodes: deletedPairingCodes || 0,
  });
} catch (err) {
  console.error("Cleanup failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
