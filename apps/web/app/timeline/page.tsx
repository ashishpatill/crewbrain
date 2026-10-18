"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "../components/tenant";

type Event = {
  ts: number;
  kind: string;
  id: string;
  title: string;
  status: string | null;
  actor: string | null;
  detail: string | null;
  validFrom: number | null;
  validTo: number | null;
};

function fmt(ms: number) {
  return new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

const KINDS = ["all", "decision", "memory", "source", "proposal", "episode", "procedure"] as const;

export default function TimelinePage() {
  const [tenant] = useTenant();
  const [events, setEvents] = useState<Event[]>([]);
  const [type, setType] = useState<(typeof KINDS)[number]>("all");
  const [asOfMode, setAsOfMode] = useState<"now" | "date">("now");
  const [asOfDate, setAsOfDate] = useState("2026-10-01");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ tenant, type, limit: "80" });
      if (asOfMode === "date") {
        const t = Date.parse(`${asOfDate}T23:59:59+05:30`);
        if (!Number.isNaN(t)) params.set("asOf", String(t));
      }
      const res = await fetch(`/api/timeline?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setEvents(data.events);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [type, asOfMode, asOfDate, tenant]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Timeline</h1>
        <p className="page-desc">Chronological events in the current tenant graph.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Scope type</label>
          <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value as (typeof KINDS)[number])}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">As of</label>
          <div className="flex gap-1">
            <select className="input w-auto" value={asOfMode} onChange={(e) => setAsOfMode(e.target.value as "now" | "date")}>
              <option value="now">now</option>
              <option value="date">date</option>
            </select>
            {asOfMode === "date" && (
              <input className="input w-40" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            )}
          </div>
        </div>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}

      {!loading && events.length === 0 && <div className="empty">No events in this scope.</div>}

      <ul className="space-y-2">
        {events.map((e) => (
          <li key={`${e.kind}-${e.id}-${e.ts}`} className="card flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="w-40 shrink-0 font-mono text-[11px] text-neutral-500">{fmt(e.ts)}</div>
            <span className="pill pill-kind">{e.kind}</span>
            <div className="min-w-0 flex-1">
              <div className="text-neutral-100">
                <span className="font-mono text-xs text-neutral-500">{e.id}</span> {e.title}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {e.status && <span className="pill pill-skipped">{e.status}</span>}
                {e.actor && <span>by {e.actor}</span>}
                {e.detail && <span className="ml-2 text-amber-500/80">{e.detail}</span>}
                {e.validTo && <span className="ml-2 font-mono text-neutral-600">valid_to {fmt(e.validTo)}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
