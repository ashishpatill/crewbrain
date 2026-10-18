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
    <div className="max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">Sandboxes</h1>
      <p className="text-sm text-neutral-400">Each sandbox is its own FalkorDB graph with a tiny starter seed. It expires 24 hours after creation; at most {cap} exist at once.</p>
      <button onClick={create} className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white">New sandbox</button>
      {msg && <div className="text-sm text-neutral-300">{msg}</div>}
      {lastId && (
        <button onClick={() => openInAsk(lastId)} className="rounded border border-neutral-700 px-3 py-1.5 text-sm">
          Open in Ask
        </button>
      )}
      <table className="w-full font-mono text-xs">
        <thead className="text-neutral-500"><tr><th className="text-left">graph</th><th>memory</th><th>nodes</th><th>edges</th><th>expires</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} className="py-2 text-neutral-500">No sandboxes yet.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-neutral-800">
              <td className="py-1">{r.graph}</td>
              <td className="text-center">{r.total_mb < 1 ? "<1" : r.total_mb.toFixed(1)} MB</td>
              <td className="text-center">{r.nodes}</td>
              <td className="text-center">{r.edges}</td>
              <td className="text-center">{new Date(r.expires_at).toLocaleString()}</td>
              <td className="text-center">
                <button onClick={() => openInAsk(r.id)} className="rounded border border-neutral-700 px-2 py-0.5 text-[11px]">
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}