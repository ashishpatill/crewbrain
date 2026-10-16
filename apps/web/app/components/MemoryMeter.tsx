"use client";

import { useEffect, useState } from "react";

type Meter = { graph: string; total_mb: number; nodes: number; edges: number };

/** Header meter: GRAPH.MEMORY USAGE for the current tenant graph, refreshed every 15s. */
export function MemoryMeter({ tenant = "acme" }: { tenant?: string }) {
  const [m, setM] = useState<Meter | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/memory?tenant=${encodeURIComponent(tenant)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j) => live && (setM(j), setErr(false)))
        .catch(() => live && setErr(true));
    load();
    const t = setInterval(load, 15000);
    return () => { live = false; clearInterval(t); };
  }, [tenant]);
  if (err) return <span className="font-mono text-xs text-red-400">memory: unavailable</span>;
  if (!m) return <span className="font-mono text-xs text-neutral-600">memory: …</span>;
  return (
    <span className="font-mono text-xs text-neutral-500" title={`GRAPH.MEMORY USAGE ${m.graph}`}>
      memory: <span className="text-neutral-300">{m.total_mb < 1 ? "<1" : m.total_mb.toFixed(1)} MB</span> · {m.nodes} nodes · {m.edges} edges
    </span>
  );
}
