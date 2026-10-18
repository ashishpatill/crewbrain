"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTenant } from "../components/tenant";
import { SUGGESTIONS } from "./suggestions";
import { validateUploadFile } from "../ingest/upload";

type Stage = { key: string; label: string; state: "done" | "stopped" | "skipped" | "pending"; detail: string; href?: string };

type Citation = { n: number; passageId: string; sourceId: string; sourceTitle: string; sourceKind: string; text: string };

type ProposalRef = { id: string; kind: string; status: string };

type RunTaskRef = { id: string; status: string; claimedBy: string | null };

type RunRecord = {
  id: string;
  text: string;
  actor: string | null;
  outcome: string;
  stages: Stage[];
  taskId: string | null;
  task: RunTaskRef | null;
  proposalIds: string[];
  proposals: ProposalRef[];
  sourceIds: string[];
  answer: string | null;
  answerAbstained: boolean | null;
  citations: Citation[];
  decisionId: string | null;
  decisionTitle: string | null;
  reaskAnswer: string | null;
  reaskAbstained: boolean | null;
  reaskCitations: Citation[];
  reaskDecisionId: string | null;
  createdAt: number;
  updatedAt: number;
  nextAction: { label: string; href?: string };
};

const STAGE_LINK: Record<string, string> = {
  ask: "/ask",
  task: "/agents",
  claim: "/agents",
  execution: "/agents",
  review: "/review",
  ingest: "/ingest",
  passages: "/ingest",
  proposal: "/review",
  reask: "/ask",
};

const icon = (s: Stage["state"]) => (s === "done" ? "✓" : s === "stopped" ? "⏸" : s === "pending" ? "…" : "○");

function RunTimeline({ stages }: { stages: Stage[] }) {
  const activeIdx = stages.findIndex((s) => s.state === "stopped" || s.state === "pending");
  return (
    <ul className="run-timeline space-y-2 text-sm">
      {stages.map((s, i) => {
        const active = activeIdx >= 0 && i === activeIdx;
        const href = STAGE_LINK[s.key];
        return (
          <li
            key={`${s.key}-${i}`}
            className={`run-stage flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${
              s.state === "done"
                ? "border-emerald-900 bg-emerald-950/30"
                : s.state === "stopped"
                ? "border-amber-900 bg-amber-950/30"
                : s.state === "pending"
                ? "border-neutral-700 bg-neutral-900/40"
                : "border-neutral-800 bg-neutral-900/20"
            } ${active ? "run-stage-active" : ""}`}
          >
            <span className={s.state === "done" ? "text-emerald-300" : s.state === "stopped" ? "text-amber-300" : "text-neutral-500"}>
              {icon(s.state)}
            </span>
            <span className="pill pill-kind font-mono text-[10px]">{s.key}</span>
            <span className="text-neutral-200">{s.label}</span>
            <span className="text-xs text-neutral-500">— {s.detail}</span>
            {href && (
              <Link href={href} className="ml-auto text-xs text-emerald-400 hover:underline">
                Open →
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function StartPageInner() {
  const [tenant] = useTenant();
  const searchParams = useSearchParams();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);

  // source
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceKind, setSourceKind] = useState("doc");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // actors
  const actors = tenant.startsWith("sbx_") ? [{ id: "you", label: "You (sandbox founder)" }] : [{ id: "nia", label: "Nia (founder)" }, { id: "ashish", label: "Ashish (platform)" }];
  const [actor, setActor] = useState(actors[0].id);
  const effectiveActor = actors.some((a) => a.id === actor) ? actor : actors[0].id;

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchRun = useCallback(async (runId?: string | null) => {
    try {
      const params = new URLSearchParams({ tenant });
      if (runId) params.set("runId", runId);
      const res = await fetch(`/api/run?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.run) {
        setRun(data.run);
        try { localStorage.setItem("crewbrain-run", data.run.id); } catch { /* ignore */ }
        return;
      }
      // fallback to latest if a specific run was requested but missing
      if (runId) {
        const res2 = await fetch(`/api/run?${new URLSearchParams({ tenant })}`);
        const data2 = await res2.json();
        if (res2.ok) {
          setRun(data2.run ?? null);
          if (data2.run?.id) try { localStorage.setItem("crewbrain-run", data2.run.id); } catch { /* ignore */ }
        }
      } else {
        setRun(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tenant]);

  useEffect(() => {
    setActor(actors[0].id);
    const qRun = searchParams.get("run");
    let rid: string | null = qRun;
    if (!rid) {
      try { rid = localStorage.getItem("crewbrain-run"); } catch { rid = null; }
    }
    void fetchRun(rid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, searchParams]);

  const submit = async (override?: string) => {
    const value = (override ?? text).trim();
    if (!value) return;
    if (override) setText(value);
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const source = sourceOpen && sourceText.trim()
        ? { text: sourceText.trim(), title: (sourceTitle || "pasted document").trim(), kind: sourceKind || "doc", author: "scribe" }
        : undefined;
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", tenant, text: value, actor: "ashish", source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setRun(data.run);
      if (data.run?.id) {
        try { localStorage.setItem("crewbrain-run", data.run.id); } catch { /* ignore */ }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setSourceError(null);
    const v = validateUploadFile(file.name, file.size);
    if (!v.ok || !v.valid) {
      setSourceError(v.error || v.message || "invalid file");
      return;
    }
    const lower = file.name.toLowerCase();
    setUploading(true);
    try {
      if (lower.endsWith(".pdf")) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/ingest/pdf", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        setSourceText(String(data.text ?? ""));
      } else {
        setSourceText(await file.text());
      }
      setSourceTitle(file.name);
      setSourceOpen(true);
    } catch (e) {
      setSourceError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const decide = async (proposalId: string, decision: "approve" | "reject") => {
    if (!run) return;
    setBusy(proposalId + decision);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "decide",
          tenant,
          runId: run.id,
          proposalId,
          actor: effectiveActor,
          decision,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setRun(data.run);
      setMessage(decision === "approve" ? `Approved ${proposalId}.` : `Rejected ${proposalId}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const ingestLater = async () => {
    if (!run || !sourceText.trim()) return;
    setBusy("ingest");
    setError(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "ingest",
          tenant,
          runId: run.id,
          text: sourceText.trim(),
          title: (sourceTitle || "pasted document").trim(),
          kind: sourceKind || "doc",
          author: "scribe",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setRun(data.run);
      setMessage("Source ingested into run.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="page-title">Start with your requirement</h1>
        <p className="page-desc">
          Graph-only pipeline (no model planning): your requirement is traced against the graph first;
          if nothing matches, a task is created and claimed by an available agent. Manual stages are
          labelled honestly.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="field-label" htmlFor="requirement">
          Your requirement
        </label>
        <textarea
          id="requirement"
          className="input min-h-32 font-mono text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe what you need…"
        />
        <p className="text-xs text-neutral-500">
          Graph-only: traced against your tenant graph; unanswered asks become crew tasks.
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn text-xs"
            onClick={() => setSourceOpen((v) => !v)}
          >
            {sourceOpen ? "Hide source" : "Attach a source (optional)"}
          </button>
          <label className="btn text-xs cursor-pointer">
            Upload file
            <input
              type="file"
              className="hidden"
              accept=".txt,.md,.json,.csv,.log,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {uploading && <span className="text-xs text-neutral-500">Extracting…</span>}
        </div>

        {sourceError && <div className="rounded-2xl border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{sourceError}</div>}

        {sourceOpen && (
          <div className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3">
            <label className="field-label" htmlFor="sourceTitle">Source title</label>
            <input id="sourceTitle" className="input" value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} placeholder="document title" />
            <label className="field-label" htmlFor="sourceKind">Kind</label>
            <input id="sourceKind" className="input" value={sourceKind} onChange={(e) => setSourceKind(e.target.value)} placeholder="doc" />
            <label className="field-label" htmlFor="sourceText">Source text</label>
            <textarea id="sourceText" className="input min-h-32 font-mono text-xs" value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="Paste document text…" />
          </div>
        )}

        <button
          type="button"
          className="btn btn-accent w-fit"
          disabled={loading || !text.trim()}
          onClick={() => void submit()}
        >
          {loading ? "Running…" : "Start →"}
        </button>
      </div>

      <div>
        <div className="section-title mb-2">Try one of these</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUGGESTIONS.map((s) => {
            if (s.action.type === "requirement") {
              const reqText = s.action.text;
              return (
                <button
                  key={s.id}
                  type="button"
                  className="card text-left"
                  disabled={loading}
                  onClick={() => void submit(reqText)}
                >
                  <div className="text-sm font-medium text-neutral-100">{s.title}</div>
                  <div className="mt-1 text-xs text-neutral-400">{s.detail}</div>
                </button>
              );
            }
            return (
              <Link key={s.id} href={s.action.href} className="card block">
                <div className="text-sm font-medium text-neutral-100">{s.title}</div>
                <div className="mt-1 text-xs text-neutral-400">{s.detail}</div>
              </Link>
            );
          })}
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{message}</div>}

      {run && (
        <div className="flex flex-col gap-4">
          <div className="panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="section-title">Next action</div>
              <span className="pill pill-kind font-mono text-[10px]">{run.outcome}</span>
            </div>
            <div className="rounded-xl border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
              {run.nextAction.label}
              {run.nextAction.href && (
                <Link href={run.nextAction.href} className="ml-2 underline">Open →</Link>
              )}
            </div>
          </div>

          <div className="panel p-4">
            <div className="section-title mb-2">Stages ({run.outcome})</div>
            <RunTimeline stages={run.stages} />
          </div>

          {run.answer && run.citations.length > 0 && (
            <div className="panel p-4">
              <div className="section-title mb-2">Traced answer</div>
              <pre className="whitespace-pre-wrap text-sm">{run.answer}</pre>
              <div className="mt-3">
                <div className="section-title mb-1">Citations</div>
                <ul className="space-y-1 text-xs">
                  {run.citations.map((c) => (
                    <li key={c.n}>[{c.n}] {c.passageId} · {c.sourceKind} {c.sourceId} “{c.sourceTitle}”</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {run.task && (
            <div className="panel p-4 text-sm">
              <div>
                Task <span className="font-mono text-emerald-300">{run.task.id}</span> · {run.task.status}
                {run.task.claimedBy ? ` · claimed by ${run.task.claimedBy}` : ""}
              </div>
            </div>
          )}

          {run.proposals.length > 0 && (
            <div className="panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="section-title">Proposals in this run</div>
                <div className="flex items-center gap-2">
                  <label className="field-label mb-0">Decide as</label>
                  <select className="input w-auto text-xs" value={effectiveActor} onChange={(e) => setActor(e.target.value)}>
                    {actors.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <ul className="space-y-3">
                {run.proposals.map((p) => (
                  <li key={p.id} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-neutral-500">
                      <span>{p.id}</span> · <span>{p.kind}</span> ·{" "}
                      <span className={p.status === "approved" ? "pill pill-approved" : p.status === "rejected" ? "pill pill-rejected" : "pill pill-pending"}>{p.status}</span>
                    </div>
                    {p.status === "pending" && (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="btn btn-accent text-xs"
                          disabled={!!busy}
                          onClick={() => void decide(p.id, "approve")}
                        >
                          {busy === p.id + "approve" ? "…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger text-xs"
                          disabled={!!busy}
                          onClick={() => void decide(p.id, "reject")}
                        >
                          {busy === p.id + "reject" ? "…" : "Reject"}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {run.proposals.some((p) => p.status === "pending") && (
                <div className="mt-3 text-xs text-neutral-500">
                  Or ingest more material into this run:{" "}
                  <button type="button" className="btn text-xs" disabled={busy === "ingest" || !sourceText.trim()} onClick={() => void ingestLater()}>
                    {busy === "ingest" ? "…" : "Ingest attached source"}
                  </button>
                </div>
              )}
            </div>
          )}

          {run.reaskAnswer && (
            <div className="panel p-4">
              <div className="section-title mb-2">Re-ask after approval</div>
              <pre className="whitespace-pre-wrap text-sm">{run.reaskAnswer}</pre>
              {run.reaskCitations.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs">
                  {run.reaskCitations.map((c) => (
                    <li key={c.n}>[{c.n}] {c.passageId} · {c.sourceKind} {c.sourceId} “{c.sourceTitle}”</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/ask" className="btn text-xs">Ask</Link>
            <Link href="/agents" className="btn text-xs">Agents</Link>
            <Link href="/review" className="btn text-xs">Review</Link>
            <Link href="/ingest" className="btn text-xs">Ingest</Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <StartPageInner />
    </Suspense>
  );
}