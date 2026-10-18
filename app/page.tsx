"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Device = {
  id: string;
  name: string;
  monitoring: boolean;
  last_seen: string;
  has_frame: boolean;
  frame_at: string | null;
  camera_facing: string;
  audio_enabled: boolean;
  stream_requested: boolean;
  screen_requested: boolean;
  has_screen?: boolean;
  screen_at?: string | null;
  battery: number | null;
  charging: boolean | null;
  network: string | null;
};

const POLL_DEVICES_MS = 5000;
const POLL_FRAME_MS = 500;

function secondsAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function Home() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((d) => setEmail(d.email ?? null))
      .catch(() => setEmail(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Loading…
      </main>
    );
  }

  if (!email) {
    return <LoginForm onLoggedIn={setEmail} />;
  }

  return <Dashboard email={email} onLogout={() => setEmail(null)} />;
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (email: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "login failed");
      onLoggedIn(data.email);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
      >
        <h1 className="text-xl font-semibold">Child Safety — Parent sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sign in with the email that will own your child&apos;s devices.
        </p>
        <input
          type="email"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="you@example.com"
          className="mt-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Continue"}
        </button>
      </form>
    </main>
  );
}

function Dashboard({
  email,
  onLogout,
}: {
  email: string;
  onLogout: () => void;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "failed");
      setDevices(data.devices as Device[]);
      setError(null);
      setSelected((prev) => prev ?? data.devices[0]?.id ?? null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadDevices();
    const id = setInterval(loadDevices, POLL_DEVICES_MS);
    return () => clearInterval(id);
  }, [loadDevices]);

  const streaming = devices.find((d) => d.id === selected)?.stream_requested;
  useEffect(() => {
    if (!selected || !streaming) {
      setFrameSrc(null);
      return;
    }
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const fetchNext = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/frame/${selected}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok && active) {
          const blob = await res.blob();
          if (active) {
            const url = URL.createObjectURL(blob);
            if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
            objectUrl.current = url;
            setFrameSrc(url);
          }
        }
      } catch {
        /* keep last frame on transient error */
      } finally {
        inFlight = false;
        if (active) {
          // Immediately schedule the next frame with a 60ms delay for ultra-smooth fluid video
          timerId = setTimeout(fetchNext, 60);
        }
      }
    };

    fetchNext();
    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [selected, streaming]);

  const [screenSrc, setScreenSrc] = useState<string | null>(null);
  const screenObjectUrl = useRef<string | null>(null);
  const [viewMode, setViewMode] = useState<"camera" | "screen">("camera");
  const [snapshotToast, setSnapshotToast] = useState<string | null>(null);

  const saveSnapshot = (mode: "camera" | "screen") => {
    const src = mode === "camera" ? frameSrc : screenSrc;
    if (!src || !current) return;
    const a = document.createElement("a");
    a.href = src;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `${current.name.toLowerCase().replace(/\s+/g, "_")}_${mode}_${stamp}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setSnapshotToast(`Snapshot captured and downloaded!`);
    setTimeout(() => setSnapshotToast(null), 2500);
  };

  const screenMirroring = devices.find((d) => d.id === selected)?.screen_requested;
  useEffect(() => {
    if (!selected || !screenMirroring) {
      setScreenSrc(null);
      return;
    }
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const fetchNextScreen = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/screen/${selected}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok && active) {
          const blob = await res.blob();
          if (active) {
            const url = URL.createObjectURL(blob);
            if (screenObjectUrl.current) URL.revokeObjectURL(screenObjectUrl.current);
            screenObjectUrl.current = url;
            setScreenSrc(url);
          }
        }
      } catch {
        /* keep last frame on transient error */
      } finally {
        inFlight = false;
        if (active) {
          timerId = setTimeout(fetchNextScreen, 60);
        }
      }
    };

    fetchNextScreen();
    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [selected, screenMirroring]);

  useEffect(() => {
    if (screenMirroring && !streaming) {
      setViewMode("screen");
    } else if (streaming && !screenMirroring) {
      setViewMode("camera");
    }
  }, [screenMirroring, streaming]);

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      if (screenObjectUrl.current) URL.revokeObjectURL(screenObjectUrl.current);
    };
  }, []);

  const logout = async () => {
    await fetch("/api/session", { method: "DELETE" });
    onLogout();
  };

  const current = devices.find((d) => d.id === selected) ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-black/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-sm">
              CS
            </span>
            <span className="text-base font-semibold tracking-tight">
              Child Safety
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{email}</div>
              <div className="text-xs text-zinc-500">Parent account</div>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {email.slice(0, 1)}
            </span>
            <button
              onClick={logout}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-zinc-200 p-5 shadow-sm dark:border-zinc-800">
          <ProfileCard email={email} deviceCount={devices.length} />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-500">
              Pairing code and admin PIN are in Settings.
            </p>
            <Link
              href="/settings"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Open Settings
            </Link>
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <aside className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Devices
          </h2>
          {devices.length === 0 && (
            <p className="px-1 text-sm text-zinc-500">
              No devices yet. Generate a code above and enter it in the app.
            </p>
          )}
          {devices.map((d) => {
            const online = Date.now() - new Date(d.last_seen).getTime() < 20000;
            return (
              <button
                key={d.id}
                onClick={() => setSelected(d.id)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selected === d.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                }`}
              >
                <span className="flex flex-col">
                  <span className="font-medium">{d.name}</span>
                  <span className="flex items-center gap-2 text-xs text-zinc-500">
                    {secondsAgo(d.last_seen)}
                    {d.battery != null && (
                      <span className="flex items-center gap-0.5">
                        {d.charging ? "⚡" : "🔋"}
                        {d.battery}%
                      </span>
                    )}
                    {d.network && d.network !== "offline" && (
                      <span>{d.network === "wifi" ? "📶 Wi-Fi" : "📱 Data"}</span>
                    )}
                  </span>
                </span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    online ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                  aria-label={online ? "online" : "offline"}
                />
              </button>
            );
          })}
        </aside>

        <section className="flex flex-col gap-3">
          {/* View Mode Switcher */}
          <div className="flex items-center justify-between">
            <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
              <button
                onClick={() => setViewMode("camera")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === "camera"
                    ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                <span>📷 Camera</span>
                {current?.stream_requested && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                )}
              </button>
              <button
                onClick={() => setViewMode("screen")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === "screen"
                    ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                <span>📱 Screen Mirror</span>
                {current?.screen_requested && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                )}
              </button>
            </div>
            {viewMode === "camera" && current?.stream_requested && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                CAMERA LIVE
              </span>
            )}
            {viewMode === "screen" && current?.screen_requested && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                SCREEN LIVE
              </span>
            )}
          </div>

          {viewMode === "camera" ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-900 dark:border-zinc-800">
              {current?.stream_requested && current?.has_frame && frameSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frameSrc}
                  alt={`Live view from ${current.name}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-zinc-400">
                  {!current
                    ? "Select a device to view its camera."
                    : current.stream_requested
                      ? "Starting camera… waiting for the first frame."
                      : "Camera is off. Press “View camera” to start the live feed."}
                </div>
              )}
              {current?.stream_requested && (
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  LIVE
                </span>
              )}
              {frameSrc && (
                <button
                  type="button"
                  onClick={() => saveSnapshot("camera")}
                  className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-md hover:bg-black/90 active:scale-95 transition-all shadow-md"
                  title="Take camera snapshot"
                >
                  <span>📸</span>
                  <span>Take snapshot</span>
                </button>
              )}
              {snapshotToast && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-xl animate-fade-in">
                  <span>✓</span>
                  <span>{snapshotToast}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 p-2 dark:border-zinc-800">
              {current?.screen_requested && screenSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <div className="relative flex h-full max-h-[500px] w-auto max-w-[340px] items-center justify-center overflow-hidden rounded-2xl border-2 border-zinc-700 bg-black shadow-2xl">
                  <img
                    src={screenSrc}
                    alt={`Live screen of ${current.name}`}
                    className="h-full w-full object-contain"
                  />
                  {/* <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    LIVE SCREEN
                  </span> */}
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-sm text-zinc-400">
                  <span className="mb-2 text-2xl">📱</span>
                  {!current
                    ? "Select a device to mirror its screen."
                    : current.screen_requested
                      ? "Starting screen mirror… waiting for frames."
                      : "Screen mirroring is off. Press “Mirror screen (Live)” below to view remote screen."}
                </div>
              )}
              {screenSrc && (
                <button
                  type="button"
                  onClick={() => saveSnapshot("screen")}
                  className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-md hover:bg-black/90 active:scale-95 transition-all shadow-md"
                  title="Take screen snapshot"
                >
                  <span>📸</span>
                  <span>Take snapshot</span>
                </button>
              )}
              {snapshotToast && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-xl animate-fade-in">
                  <span>✓</span>
                  <span>{snapshotToast}</span>
                </div>
              )}
            </div>
          )}

          {current && (
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <p>
                {current.name} ·{" "}
                {viewMode === "camera"
                  ? `last camera frame ${current.frame_at ? secondsAgo(current.frame_at) : "—"}`
                  : `last screen frame ${current.screen_at ? secondsAgo(current.screen_at) : "—"}`}
              </p>
              {((viewMode === "camera" && frameSrc) || (viewMode === "screen" && screenSrc)) && (
                <button
                  type="button"
                  onClick={() => saveSnapshot(viewMode)}
                  className="flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400"
                >
                  <span>📸</span>
                  <span>Save snapshot</span>
                </button>
              )}
            </div>
          )}

          {current && (
            <DeviceControls
              device={current}
              onChanged={loadDevices}
              onSelectView={setViewMode}
            />
          )}
        </section>
        </div>
      </main>
    </div>
  );
}

function ProfileCard({
  email,
  deviceCount,
}: {
  email: string;
  deviceCount: number;
}) {
  const [hasPin, setHasPin] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/pin")
      .then((r) => r.json())
      .then((d) => setHasPin(!!d.hasPin))
      .catch(() => setHasPin(null));
  }, []);

  return (
    <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-bold uppercase text-white shadow">
          {email.slice(0, 1)}
        </span>
        <div>
          <div className="text-lg font-semibold tracking-tight">{email}</div>
          <div className="text-sm text-zinc-500">Parent account</div>
        </div>
      </div>
      <div className="flex gap-3">
        <Stat label="Devices" value={String(deviceCount)} />
        <Stat
          label="Admin PIN"
          value={hasPin === null ? "…" : hasPin ? "Set" : "Not set"}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[88px] rounded-xl border border-zinc-200 bg-white px-4 py-2 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function DeviceControls({
  device,
  onChanged,
  onSelectView,
}: {
  device: Device;
  onChanged: () => void;
  onSelectView?: (mode: "camera" | "screen") => void;
}) {
  const [busy, setBusy] = useState(false);

  const update = async (payload: {
    cameraFacing?: "front" | "back";
    audioEnabled?: boolean;
    streamRequested?: boolean;
    screenRequested?: boolean;
  }) => {
    setBusy(true);
    try {
      await fetch(`/api/devices/${device.id}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          disabled={busy}
          onClick={() => {
            const next = !device.stream_requested;
            if (next && onSelectView) onSelectView("camera");
            update({ streamRequested: next });
          }}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors ${
            device.stream_requested
              ? "bg-red-600 hover:bg-red-700"
              : "bg-blue-600 hover:bg-blue-700"
          } disabled:opacity-60`}
        >
          {device.stream_requested ? "Stop camera" : "View camera"}
        </button>

        <button
          disabled={busy}
          onClick={() => {
            const next = !device.screen_requested;
            if (next && onSelectView) onSelectView("screen");
            update({ screenRequested: next });
          }}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors ${
            device.screen_requested
              ? "bg-rose-600 hover:bg-rose-700"
              : "bg-indigo-600 hover:bg-indigo-700"
          } disabled:opacity-60`}
        >
          {device.screen_requested ? "Stop screen mirror" : "Mirror screen (Live)"}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Camera</span>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {(["front", "back"] as const).map((f) => (
            <button
              key={f}
              disabled={busy}
              onClick={() => update({ cameraFacing: f })}
              className={`rounded-md px-3 py-1 text-sm capitalize transition-colors ${
                device.camera_facing === f
                  ? "bg-blue-600 text-white"
                  : "text-zinc-600 dark:text-zinc-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Listen (ambient mic)</span>
        <button
          disabled={busy}
          onClick={() => update({ audioEnabled: !device.audio_enabled })}
          className={`rounded-md px-3 py-1 text-sm transition-colors ${
            device.audio_enabled
              ? "bg-green-600 text-white"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {device.audio_enabled ? "On" : "Off"}
        </button>
      </div>

      {device.audio_enabled && <AudioListener deviceId={device.id} />}
      <p className="text-xs text-zinc-400">
        The child&apos;s device shows a visible notification whenever camera, mic,
        or screen mirror is active.
      </p>

      <DeviceActivityTabs deviceId={device.id} />
    </div>
  );
}

function DeviceActivityTabs({ deviceId }: { deviceId: string }) {
  const [activeTab, setActiveTab] = useState<"notifications" | "calls">(
    "notifications",
  );

  return (
    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <div className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/80">
        <button
          onClick={() => setActiveTab("notifications")}
          className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${
            activeTab === "notifications"
              ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          }`}
        >
          Notifications
        </button>
        <button
          onClick={() => setActiveTab("calls")}
          className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${
            activeTab === "calls"
              ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          }`}
        >
          Call History
        </button>
      </div>

      {activeTab === "notifications" ? (
        <AppActivity deviceId={deviceId} />
      ) : (
        <CallHistory deviceId={deviceId} />
      )}
    </div>
  );
}

type Activity = {
  id: string;
  app: string;
  package: string | null;
  title: string | null;
  message: string | null;
  posted_at: string;
};

function getAppBadgeStyle(appName: string) {
  const lower = appName.toLowerCase();
  if (lower.includes("whatsapp"))
    return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  if (lower.includes("telegram"))
    return "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30";
  if (lower.includes("instagram"))
    return "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30";
  if (lower.includes("snapchat"))
    return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
  if (lower.includes("message") || lower.includes("sms"))
    return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";
  if (lower.includes("gmail") || lower.includes("mail"))
    return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
  if (lower.includes("youtube"))
    return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
  return "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30";
}

function AppActivity({ deviceId }: { deviceId: string }) {
  const [items, setItems] = useState<Activity[]>([]);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/app-activity/${deviceId}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (active && data.ok) setItems(data.activity as Activity[]);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [deviceId]);

  const filtered = filter
    ? items.filter(
        (a) =>
          a.app.toLowerCase().includes(filter.toLowerCase()) ||
          a.title?.toLowerCase().includes(filter.toLowerCase()) ||
          a.message?.toLowerCase().includes(filter.toLowerCase()),
      )
    : items;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight">Notifications</span>
          <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-500/30">
            AirDroid Mirror
          </span>
        </div>
        <span className="text-xs text-zinc-400 font-mono">
          {items.length} {items.length === 1 ? "notification" : "notifications"}
        </span>
      </div>

      {items.length > 3 && (
        <div className="mt-2">
          <input
            type="text"
            placeholder="Search notification messages..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-2.5 rounded-lg border border-dashed border-zinc-200 p-4 text-center dark:border-zinc-800">
          <p className="text-xs text-zinc-500">
            {items.length === 0
              ? "No notifications yet. Enable “Notification access” in the child app to mirror messages."
              : "No notifications match your search."}
          </p>
        </div>
      ) : (
        <ul className="mt-2.5 flex max-h-80 flex-col gap-2 overflow-y-auto pr-0.5">
          {filtered.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border border-zinc-200 bg-white/70 p-2.5 shadow-xs transition hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium tracking-tight ${getAppBadgeStyle(
                    a.app,
                  )}`}
                >
                  {a.app}
                </span>
                <span className="text-[11px] text-zinc-400 font-mono whitespace-nowrap">
                  {secondsAgo(a.posted_at)}
                </span>
              </div>
              {a.title && (
                <div className="mt-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                  {a.title}
                </div>
              )}
              {a.message ? (
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                  {a.message}
                </div>
              ) : (
                !a.title && (
                  <div className="mt-1 text-[11px] italic text-zinc-400">
                    (Notification received)
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CallLog = {
  id: string;
  call_id: string | null;
  caller_name: string | null;
  phone_number: string;
  call_type: "incoming" | "outgoing" | "missed" | "rejected" | string;
  duration: number;
  called_at: string;
};

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function getCallTypeBadge(type: string) {
  switch (type.toLowerCase()) {
    case "incoming":
      return {
        label: "Incoming",
        color:
          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        icon: "↙",
      };
    case "outgoing":
      return {
        label: "Outgoing",
        color:
          "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
        icon: "↗",
      };
    case "missed":
      return {
        label: "Missed",
        color:
          "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
        icon: "✕",
      };
    case "rejected":
      return {
        label: "Rejected",
        color:
          "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        icon: "⊘",
      };
    default:
      return {
        label: type,
        color:
          "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
        icon: "•",
      };
  }
}

function CallHistory({ deviceId }: { deviceId: string }) {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "incoming" | "missed" | "outgoing"
  >("all");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/call-logs/${deviceId}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (active && data.ok) setCalls(data.calls as CallLog[]);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [deviceId]);

  const filtered = calls.filter((c) => {
    if (typeFilter !== "all" && c.call_type.toLowerCase() !== typeFilter)
      return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      c.phone_number.toLowerCase().includes(q) ||
      (c.caller_name && c.caller_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight">Call History</span>
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            AirDroid Calls
          </span>
        </div>
        <span className="text-xs text-zinc-400 font-mono">
          {calls.length} {calls.length === 1 ? "call" : "calls"}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="text"
          placeholder="Search caller name or number..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div className="mt-2 flex items-center gap-1 text-[11px]">
        {(["all", "incoming", "missed", "outgoing"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-md px-2 py-0.5 capitalize transition-colors ${
              typeFilter === t
                ? "bg-blue-600 text-white font-medium"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-2.5 rounded-lg border border-dashed border-zinc-200 p-4 text-center dark:border-zinc-800">
          <p className="text-xs text-zinc-500">
            {calls.length === 0
              ? "No call logs yet. Enable “Call tracking” in the child app to track incoming, outgoing and missed calls."
              : "No calls match your filter."}
          </p>
        </div>
      ) : (
        <ul className="mt-2.5 flex max-h-80 flex-col gap-2 overflow-y-auto pr-0.5">
          {filtered.map((c) => {
            const badge = getCallTypeBadge(c.call_type);
            return (
              <li
                key={c.id}
                className="rounded-lg border border-zinc-200 bg-white/70 p-2.5 shadow-xs transition hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-bold ${badge.color}`}
                    >
                      {badge.icon} {badge.label}
                    </span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {c.caller_name || c.phone_number}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono whitespace-nowrap">
                    {secondsAgo(c.called_at)}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-mono text-[11px]">
                    {c.caller_name ? c.phone_number : ""}
                  </span>
                  <span className="text-[11px]">
                    {c.call_type === "missed"
                      ? "Not answered"
                      : `Duration: ${formatDuration(c.duration)}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AudioListener({ deviceId }: { deviceId: string }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [meter, setMeter] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const lastSeqRef = useRef<number>(0);

  // Update volume in real-time
  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(
        muted ? 0 : volume,
        audioCtxRef.current.currentTime,
      );
    }
  }, [volume, muted]);

  useEffect(() => {
    let active = true;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(muted ? 0 : volume, ctx.currentTime);

    // Audio level meter
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
    gainNodeRef.current = masterGain;

    nextPlayTimeRef.current = 0;
    lastSeqRef.current = 0;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const meterInterval = setInterval(() => {
      if (!active) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      setMeter(Math.min(100, Math.round((avg / 128) * 100)));
    }, 100);

    const fetchNext = async () => {
      if (!active) return;
      try {
        const since = lastSeqRef.current;
        const res = await fetch(
          `/api/audio/${deviceId}?since=${since}&t=${Date.now()}`,
          { cache: "no-store" },
        );

        if (!active) return;

        if (res.status === 200) {
          const seqHeader = res.headers.get("X-Audio-Seq");
          if (seqHeader) {
            lastSeqRef.current = parseInt(seqHeader, 10);
          }
          const arrayBuffer = await res.arrayBuffer();
          if (active && arrayBuffer.byteLength >= 44) {
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
            if (active) {
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(masterGain);

              const now = ctx.currentTime;
              // If buffer starved or just starting, start with tiny 60ms lead
              if (nextPlayTimeRef.current < now) {
                nextPlayTimeRef.current = now + 0.06;
              }

              source.start(nextPlayTimeRef.current);
              nextPlayTimeRef.current += audioBuffer.duration;
              setPlaying(true);
            }
          }
          // Fetch immediately (40ms) to drain any backlog in queue and maintain seamless playback
          if (active) {
            setTimeout(fetchNext, 40);
          }
          return;
        }
      } catch {
        /* ignore network transients */
      }

      // No new chunk (204) or error: poll again in 300ms
      if (active) {
        setTimeout(fetchNext, 300);
      }
    };

    fetchNext();

    return () => {
      active = false;
      clearInterval(meterInterval);
      try {
        ctx.close();
      } catch {}
      audioCtxRef.current = null;
      gainNodeRef.current = null;
    };
  }, [deviceId]);

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-950 dark:bg-emerald-950/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          {playing
            ? "Continuous live ambient listening"
            : "Connecting live mic stream…"}
        </div>
        <button
          onClick={() => {
            if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
              audioCtxRef.current.resume();
            }
            setMuted(!muted);
          }}
          className="rounded-md bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          {muted ? "Unmute 🔈" : "Mute 🔊"}
        </button>
      </div>

      {/* Live Sound Level Meter */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-zinc-500">Mic Level:</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950">
          <div
            className="h-full bg-emerald-500 transition-all duration-75"
            style={{ width: `${Math.max(meter, playing ? 8 : 0)}%` }}
          />
        </div>
        <span className="w-8 text-right text-[10px] tabular-nums text-zinc-500">
          {meter}%
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">Volume:</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={muted ? 0 : volume}
          onChange={(e) => {
            if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
              audioCtxRef.current.resume();
            }
            setMuted(false);
            setVolume(parseFloat(e.target.value));
          }}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-emerald-600 dark:bg-zinc-700"
        />
        <span className="w-9 text-right text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-400">
          {muted ? "0%" : `${Math.round(volume * 100)}%`}
        </span>
      </div>
    </div>
  );
}

