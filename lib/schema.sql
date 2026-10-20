-- Child Safety parent dashboard schema.
-- Run once against your Supabase/Postgres database:
--   psql "$DATABASE_URL" -f lib/schema.sql

create table if not exists devices (
  id          text primary key,
  name        text not null default 'Child device',
  monitoring  boolean not null default false,
  last_seen   timestamptz not null default now()
);

-- Devices are bound to the parent account (email) that paired them.
alter table devices add column if not exists owner_email text;

-- Short-lived 6-digit codes an admin generates to pair a new child device.
-- The child app sends the code; on success the device's owner_email is set to
-- the admin's email (the "same email" binding).
create table if not exists pairing_codes (
  code        text primary key,
  owner_email text not null,
  device_id   text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  claimed_at  timestamptz
);

create index if not exists idx_devices_owner on devices(owner_email);
create index if not exists idx_pairing_email on pairing_codes(owner_email);

-- A stable, reusable pairing code per account. The same code can connect many
-- child devices and does not expire (regenerate to rotate it).
create table if not exists account_codes (
  email      text primary key,
  code       text unique not null,
  created_at timestamptz not null default now()
);

-- Only the latest frame per device is kept (upsert on device_id), so storage
-- stays bounded regardless of how long monitoring runs.
create table if not exists frames (
  device_id   text primary key references devices(id) on delete cascade,
  image       bytea not null,
  mime        text not null default 'image/jpeg',
  captured_at timestamptz not null default now()
);

-- Parent-controlled, device-applied settings. The child app polls these and
-- applies them while monitoring is on (always with the visible indicator).
alter table devices add column if not exists camera_facing text not null default 'front';
alter table devices add column if not exists audio_enabled boolean not null default false;
-- On-demand: camera is OFF by default; the child device only captures while the
-- parent has explicitly requested a live view.
alter table devices add column if not exists stream_requested boolean not null default false;
-- FCM token so the server can wake this device on demand.
alter table devices add column if not exists fcm_token text;
-- App hiding: when true, the child app removes its launcher icon. It is reopened
-- by dialing *#*#<secret_code>#*#* in the phone dialer. secret_code is a 6-digit
-- code generated per device (the volatile default fills existing + new rows) and
-- shown to the parent in the dashboard.
alter table devices add column if not exists app_hidden boolean not null default false;
alter table devices add column if not exists secret_code text not null default (100000 + floor(random() * 900000)::int)::text;
-- Device status (battery / network) reported by the child app.
alter table devices add column if not exists battery int;
alter table devices add column if not exists charging boolean;
alter table devices add column if not exists network text;

-- Latest ambient audio clip per device (short clips, upsert to bound storage).
create table if not exists audio_clips (
  device_id   text primary key references devices(id) on delete cascade,
  clip        bytea not null,
  mime        text not null default 'audio/mp4',
  captured_at timestamptz not null default now()
);

-- Per-account admin PIN (hashed). The child app can't disable monitoring
-- without it. OS-level permission revocation is deliberately NOT blocked.
create table if not exists account_pins (
  email      text primary key,
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);

-- A per-account event log shown as the parent's notifications list.
create table if not exists events (
  id         bigserial primary key,
  email      text not null,
  device_id  text,
  type       text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_email on events(email, created_at desc);

-- App activity & notifications log: app, title, message content, package, and timestamp.
create table if not exists app_activity (
  id         bigserial primary key,
  device_id  text not null references devices(id) on delete cascade,
  app        text not null,
  package    text,
  title      text,
  message    text,
  posted_at  timestamptz not null default now()
);

alter table app_activity add column if not exists title text;
alter table app_activity add column if not exists message text;

create index if not exists idx_appactivity on app_activity(device_id, posted_at desc);

-- Call logs tracking: caller name, phone number, call type (incoming, outgoing, missed, rejected), duration, time.
create table if not exists call_logs (
  id           bigserial primary key,
  device_id    text not null references devices(id) on delete cascade,
  call_id      text,
  caller_name  text,
  phone_number text not null,
  call_type    text not null,
  duration     int not null default 0,
  called_at    timestamptz not null default now()
);

create unique index if not exists idx_call_logs_device_call_id on call_logs(device_id, call_id);
create index if not exists idx_call_logs_device_called_at on call_logs(device_id, called_at desc);

-- Per-account data retention preference in days (default: 30 days).
-- Older notifications, call logs, and events beyond this window are purged automatically by the midnight cron.
create table if not exists account_retention (
  email          text primary key,
  retention_days int not null default 30,
  updated_at     timestamptz not null default now()
);

-- Persistent snapshot gallery: captured photos and screen captures.
create table if not exists snapshots (
  id          bigserial primary key,
  device_id   text not null references devices(id) on delete cascade,
  owner_email text not null,
  source      text not null default 'camera', -- 'camera' or 'screen'
  image       bytea not null,
  mime        text not null default 'image/jpeg',
  created_at  timestamptz not null default now()
);

alter table devices add column if not exists snapshot_requested text;

create index if not exists idx_snapshots_device on snapshots(device_id, created_at desc);
create index if not exists idx_snapshots_email on snapshots(owner_email, created_at desc);


