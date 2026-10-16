"use client";

import { useCallback, useEffect, useState } from "react";

type Proposal = {
  id: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  createdAt: number;
  decidedBy: string | null;
  decidedAt: number | null;
  createdBy: string | null;
};

const ACTORS = [
  { id: "asha", label: "Asha (founder)" },
  { id: "ravi", label: "Ravi (backend)" },
];

function summarize(p: Proposal): string {
  const pl = p.payload as { title?: string; name?: string; text?: string; supersedes?: string; partial?: boolean };
  if (p.kind === "decision") {
    return `${pl.title ?? "decision"}${pl.supersedes ? ` · supersedes ${pl.supersedes}${pl.partial ? " (partial)" : ""}` : ""}`;
  }
  if (p.kind === "procedure") return pl.name ?? "procedure";
  return (pl.text as string)?.slice(0, 120) ?? "memory";
}

export default function ReviewPage() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [actor, setActor] = useState("asha");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ tenant: "acme" });
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/proposals?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setProposals(data.proposals);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (proposalId: string, action: "approve" | "reject") => {
    setBusy(proposalId + action);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant: "acme", proposalId, actor, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setMessage(
        action === "approve"
          ? `Approved ${proposalId}. Created: ${(data.createdIds ?? []).join(", ") || "none"}`
          : `Rejected ${proposalId}`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Status</label>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="all">all</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Decide as (Person only)</label>
          <select className="input w-auto" value={actor} onChange={(e) => setActor(e.target.value)}>
            {ACTORS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>Refresh</button>
      </div>

      <p className="text-xs text-neutral-500">
        Agents cannot approve — the API checks that the actor is a <code>Person</code> node. Approving a decision proposal writes it into FalkorDB and closes any superseded decision with <code>valid_to</code>.
      </p>

      {error && <div className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}
      {message && <div className="rounded border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{message}</div>}

      {!loading && proposals.length === 0 && <div className="empty">No proposals. Ingest the R2 sample chat to open one.</div>}

      <ul className="space-y-3">
        {proposals.map((p) => (
          <li key={p.id} className="panel p-3">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-neutral-500">
                  {p.id} · {p.kind} · <span className="text-neutral-300">{p.status}</span>
                  {p.createdBy && <> · by {p.createdBy}</>}
                </div>
                <div className="mt-1 text-sm text-neutral-100">{summarize(p)}</div>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-neutral-900/60 p-2 text-[11px] text-neutral-500">
                  {JSON.stringify(p.payload, null, 2)}
                </pre>
              </div>
              {p.status === "pending" && (
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    className="btn btn-accent"
                    disabled={!!busy}
                    onClick={() => void act(p.id, "approve")}
                  >
                    {busy === p.id + "approve" ? "…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={!!busy}
                    onClick={() => void act(p.id, "reject")}
                  >
                    {busy === p.id + "reject" ? "…" : "Reject"}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
