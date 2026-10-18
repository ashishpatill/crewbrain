"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setStoredTenant } from "../components/tenant";

type Row = { id: string; graph: string; created_at: number; expires_at: number; total_mb: number; nodes: number; edges: number };

export default function SandboxPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [cap, setCap] = useState(20);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const load = () => fetch("/api/sandbox").then((r) => r.json()).then((j) => { setRows(j.sandboxes ?? []); setCap(j.cap ?? 20); });
  useEffect(() => { load(); }, []);
  async function create() {
    setMsg(null);
    setLastId(null);
    const r = await fetch("/api/sandbox", { method: "POST" });
    const j = await r.json();
    if (r.ok) {
      setMsg(`Created ${j.graph}`);
      setLastId(j.id);
    } else {
      setMsg(j.error);
    }
    load();
  }
  function openInAsk(id: string) {
    setStoredTenant(id);
    router.push("/ask");
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Sandboxes</h1>
        <p className="page-desc">Each sandbox is its own FalkorDB graph with a tiny starter seed. It expires 24 hours after creation; at most {cap} exist at once.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={create} className="btn btn-accent">New sandbox</button>
        {msg && <span className="text-sm text-neutral-300">{msg}</span>}
        {lastId && (
          <button onClick={() => openInAsk(lastId)} className="btn">Open in Ask</button>
        )}
      </div>

      {rows.length === 0 && <div className="empty">No sandboxes yet.</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.id} className="card">
            <div className="font-mono text-sm text-neutral-100">{r.graph}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-400">
              <div>memory: {r.total_mb < 1 ? "<1" : r.total_mb.toFixed(1)} MB</div>
              <div>nodes: {r.nodes}</div>
              <div>edges: {r.edges}</div>
              <div>expires: {new Date(r.expires_at).toLocaleString()}</div>
            </div>
            <div className="mt-3">
              <button onClick={() => openInAsk(r.id)} className="btn text-xs">Open</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
