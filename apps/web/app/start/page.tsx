"use client";

import { useState } from "react";
import Link from "next/link";
import { useTenant } from "../components/tenant";
import { SUGGESTIONS } from "./suggestions";

type Stage = { key: string; label: string; state: "done" | "stopped" | "skipped"; detail: string };

type Citation = { n: number; passageId: string; sourceId: string; sourceTitle: string; sourceKind: string; text: string };

type RequirementResult = {
  graph: string;
  stages: Stage[];
  ask?: {
    question: string;
    abstained: boolean;
    answer: string;
    citations: Citation[];
    decision: null | { id: string; title: string };
  };
  task?: { id: string; title: string; status: string; claimedBy: string | null };
  pendingProposals: { id: string; kind: string; status: string }[];
  outcome: string;
};

const icon = (s: Stage["state"]) => (s === "done" ? "✓" : s === "stopped" ? "⏸" : "○");

export default function StartPage() {
  const [tenant] = useTenant();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RequirementResult | null>(null);

  const submit = async (override?: string) => {
    const value = (override ?? text).trim();
    if (!value) return;
    if (override) setText(value);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/requirement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant, text: value, actor: "omar" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
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

      {result && (
        <div className="flex flex-col gap-4">
          <div className="panel p-4">
            <div className="section-title mb-2">Stages ({result.outcome})</div>
            <ul className="space-y-2 text-sm">
              {result.stages.map((s) => (
                <li key={s.key} className="flex flex-wrap items-center gap-2">
                  <span className={s.state === "done" ? "text-emerald-300" : s.state === "stopped" ? "text-amber-300" : "text-neutral-500"}>
                    {icon(s.state)}
                  </span>
                  <span className="pill pill-kind font-mono">{s.key}</span>
                  <span className="text-neutral-200">{s.label}</span>
                  <span className="text-xs text-neutral-500">— {s.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {result.ask && result.ask.citations.length > 0 && (
            <div className="panel p-4">
              <div className="section-title mb-2">Traced answer</div>
              <pre className="whitespace-pre-wrap text-sm">{result.ask.answer}</pre>
              <div className="mt-3">
                <div className="section-title mb-1">Citations (passage ids + source titles)</div>
                <ul className="space-y-1 text-xs">
                  {result.ask.citations.map((c) => (
                    <li key={c.n}>
                      [{c.n}] {c.passageId} · {c.sourceKind} {c.sourceId} “{c.sourceTitle}”
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {result.task && (
            <div className="panel p-4 text-sm">
              <div>
                Task <span className="font-mono text-emerald-300">{result.task.id}</span> · {result.task.status}
                {result.task.claimedBy ? ` · claimed by ${result.task.claimedBy}` : ""}
              </div>
              <div className="mt-2 text-xs text-neutral-500">{result.task.title}</div>
            </div>
          )}

          {result.pendingProposals.length > 0 && (
            <div className="rounded-2xl border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
              {result.pendingProposals.length} pending proposal(s) need human review:{" "}
              {result.pendingProposals.map((p) => p.id).join(", ")}.{" "}
              <Link href="/review" className="underline">Open Review →</Link>
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/ask" className="btn text-xs">Ask</Link>
            <Link href="/agents" className="btn text-xs">Agents</Link>
            <Link href="/review" className="btn text-xs">Review</Link>
          </div>
        </div>
      )}
    </div>
  );
}
