// Inserts one test device + frame so the dashboard shows something.
// Run with: node --env-file=.env.local scripts/seed-frame.mjs
import pg from "pg";

// A tiny 2x2 JPEG (base64) just to prove the pipeline end to end.
const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwA//9k=";

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
  await client.query(
    `insert into devices (id, name, monitoring, last_seen)
     values ('test-device-1', 'Test device', true, now())
     on conflict (id) do update set last_seen = now(), monitoring = true`,
  );
  await client.query(
    `insert into frames (device_id, image, mime, captured_at)
     values ('test-device-1', $1, 'image/jpeg', now())
     on conflict (device_id) do update
       set image = excluded.image, captured_at = now()`,
    [Buffer.from(JPEG_B64, "base64")],
  );
  console.log("Seeded test-device-1 with a sample frame.");
} catch (err) {
  console.error("Seed failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
