"use client";

import { useEffect, useState } from "react";

export function PairingPanel() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (rotate: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pair/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "failed");
      setCode(data.code);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  // Show the account's stable code on load (same code every time, from the DB).
  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm dark:border-zinc-800">
      <h2 className="text-sm font-semibold">Pair a device</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Enter this code in the Child Safety app on each child&apos;s phone. The
        same code works for every device and does not expire.
      </p>
      <div className="mt-3 font-mono text-3xl font-bold tracking-[0.3em] text-blue-600">
        {code ?? "······"}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={() => load(true)}
        disabled={busy}
        className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {busy ? "Working…" : "Rotate code"}
      </button>
    </div>
  );
}

export function PinPanel() {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pin")
      .then((r) => r.json())
      .then((d) => setHasPin(!!d.hasPin))
      .catch(() => setHasPin(null));
  }, []);

  const save = async () => {
    setMsg(null);
    const res = await fetch("/api/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (data.ok) {
      setHasPin(true);
      setPin("");
      setMsg("PIN saved.");
    } else {
      setMsg(data.error ?? "Failed.");
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm dark:border-zinc-800">
      <h2 className="text-sm font-semibold">Admin PIN</h2>
      <p className="mt-1 text-xs text-zinc-500">
        {hasPin
          ? "A PIN is set. The child app requires it to stop monitoring or unpair."
          : "Set a 4–8 digit PIN. The child app will require it to stop monitoring."}
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="PIN"
          inputMode="numeric"
          className="w-32 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={save}
          disabled={pin.length < 4}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {hasPin ? "Change PIN" : "Set PIN"}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-zinc-500">{msg}</p>}
    </div>
  );
}

export function DataRetentionPanel() {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [cleanupResult, setCleanupResult] = useState<{
    deletedEvents: number;
    deletedActivity: number;
    deletedCalls: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/retention")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.retentionDays) {
          setDays(d.retentionDays);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (selectedDays: number) => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: selectedDays }),
      });
      const data = await res.json();
      if (data.ok) {
        setDays(selectedDays);
        setStatusMsg(`Saved! Data older than ${selectedDays} days will be auto-deleted.`);
      } else {
        setStatusMsg(data.error ?? "Failed to save.");
      }
    } catch {
      setStatusMsg("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const runCleanupNow = async () => {
    setCleaning(true);
    setStatusMsg(null);
    setCleanupResult(null);
    try {
      const res = await fetch("/api/retention/cleanup", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setCleanupResult({
          deletedEvents: data.deletedEvents ?? 0,
          deletedActivity: data.deletedActivity ?? 0,
          deletedCalls: data.deletedCalls ?? 0,
        });
        setStatusMsg("Manual cleanup completed successfully!");
      } else {
        setStatusMsg(data.error ?? "Cleanup failed.");
      }
    } catch {
      setStatusMsg("Network error during cleanup.");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Automatic Data Retention & Cleanup</h2>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300">
          Daily at 12:00 AM
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Notifications, call logs, and event records older than your chosen duration are automatically purged every night at 12:00 AM midnight.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[7, 15, 30, 60, 90].map((d) => (
          <button
            key={d}
            onClick={() => save(d)}
            disabled={saving || loading}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              days === d
                ? "bg-blue-600 text-white"
                : "border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {d} Days
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-zinc-500">Custom days:</span>
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
          className="w-20 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={() => save(days)}
          disabled={saving || loading}
          className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="mt-5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="text-xs text-zinc-500">
            Keep data from: <strong className="text-zinc-700 dark:text-zinc-300">Last {days} days</strong>
          </div>
          <button
            onClick={runCleanupNow}
            disabled={cleaning}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-900 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
          >
            {cleaning ? "Cleaning…" : "Clean Up Now"}
          </button>
        </div>

        {statusMsg && (
          <p className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400">
            {statusMsg}
          </p>
        )}

        {cleanupResult && (
          <div className="mt-2 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-400">
            Purged: {cleanupResult.deletedCalls} call logs, {cleanupResult.deletedActivity} notifications, {cleanupResult.deletedEvents} events.
          </div>
        )}
      </div>
    </div>
  );
}

