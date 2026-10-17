"use client";

import { useCallback, useMemo, useState } from "react";

type Citation = { n: number; passageId: string; sourceId: string; sourceTitle: string; sourceKind: string; text: string };
type AskResult = {
  question: string;
  asOf: number;
  mode: string;
  abstained: boolean;
  answer: string;
  latencyMs: number;
  entities: { id: string; name: string; via: string }[];
  decision: null | {
    id: string;
    title: string;
    statement: string;
    status: string;
    decidedAt: number;
    validFrom: number;
    validTo: number | null;
    chose: { id: string; name: string }[];
    rejected: { id: string; name: string; reason: string }[];
    decidedBy: { id: string; name: string }[];
    approvedBy: { id: string; name: string }[];
    reasons: { id: string; kind: string; text: string; passages: { id: string; text: string; sourceId: string; sourceTitle: string }[] }[];
    supersedes: { id: string; title: string }[];
    supersededBy: { id: string; title: string }[];
  };
  citations: Citation[];
  closestRelated: { id: string; name: string }[];
  pathIds: string[];
  cypher: { query: string; params: Record<string, unknown> }[];
  validation: { valid: string[]; invalid: string[] };
};

type SourceDrawer = {
  type: string;
  id?: string;
  text?: string;
  title?: string;
  kind?: string;
  passages?: { id: string; idx: number; text: string }[];
  sourceId?: string;
  sourceTitle?: string;
  sourceKind?: string;
};

const EXAMPLES = [
  "Why did we choose Amazon S3 over MySQL for media storage?",
  "Why did we choose MongoDB?",
  "Why did we pick Stripe instead of Adyen?",
];

function fmt(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export default function AskPage() {
  const [question, setQuestion] = useState(EXAMPLES[0]);
  const [asOfMode, setAsOfMode] = useState<"now" | "date">("now");
  const [asOfDate, setAsOfDate] = useState("2026-09-01");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [tab, setTab] = useState<"path" | "cypher">("path");
  const [drawer, setDrawer] = useState<SourceDrawer | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const asOf = useMemo(() => {
    if (asOfMode === "now") return undefined;
    const t = Date.parse(`${asOfDate}T12:00:00+05:30`);
    return Number.isNaN(t) ? undefined : t;
  }, [asOfMode, asOfDate]);

  const run = useCallback(async (q?: string) => {
    const questionText = (q ?? question).trim();
    if (!questionText) return;
    setLoading(true);
    setError(null);
    setDrawer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: questionText, tenant: "acme", asOf, store: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setResult(data);
      setQuestion(questionText);
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [question, asOf]);

  const openCite = async (c: Citation) => {
    setHighlight(c.passageId);
    const res = await fetch(`/api/source?id=${encodeURIComponent(c.passageId)}&tenant=acme`);
    const data = await res.json();
    if (res.ok) setDrawer(data);
  };

  const answerHtml = useMemo(() => {
    if (!result) return null;
    const parts = result.answer.split(/(\[\d+\])/g);
    return parts.map((p, i) => {
      const m = /^\[(\d+)\]$/.exec(p);
      if (!m) return <span key={i}>{p}</span>;
      const n = Number(m[1]);
      const c = result.citations.find((x) => x.n === n);
      if (!c) return <span key={i}>{p}</span>;
      return (
        <button key={i} type="button" className="cite" onClick={() => openCite(c)} title={c.sourceTitle}>
          [{n}]
        </button>
      );
    });
  }, [result]);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <div className="min-w-[20rem] flex-1">
          <label className="mb-1 block text-xs text-neutral-500">Question</label>
          <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask why…" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">As of</label>
          <div className="flex gap-1">
            <select
              className="input w-auto"
              value={asOfMode}
              onChange={(e) => setAsOfMode(e.target.value as "now" | "date")}
            >
              <option value="now">now</option>
              <option value="date">date</option>
            </select>
            {asOfMode === "date" && (
              <input className="input w-40" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            )}
          </div>
        </div>
        <button className="btn btn-accent" type="submit" disabled={loading}>
          {loading ? "Tracing…" : "Ask"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="btn text-xs" onClick={() => void run(ex)}>
            {ex.length > 48 ? ex.slice(0, 48) + "…" : ex}
          </button>
        ))}
      </div>

      {error && <div className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}

      {!result && !loading && !error && (
        <div className="empty">Ask a question to see the answer and the FalkorDB path behind it.</div>
      )}

      {result && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="panel flex min-h-0 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-xs text-neutral-500">
              <span>
                Answer · {result.mode} · {result.latencyMs} ms
                {result.abstained ? " · abstained" : ""}
              </span>
              <span className="font-mono">as of {fmt(result.asOf)}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3 py-3 text-sm leading-relaxed">{answerHtml}</div>
            {result.citations.length > 0 && (
              <div className="border-t border-neutral-800 px-3 py-2">
                <div className="mb-1 text-xs uppercase tracking-wider text-neutral-600">Sources</div>
                <ul className="space-y-1 text-xs">
                  {result.citations.map((c) => (
                    <li key={c.n}>
                      <button type="button" className="cite" onClick={() => openCite(c)}>
                        [{c.n}]
                      </button>{" "}
                      <span className="font-mono text-neutral-500">{c.passageId}</span> · {c.sourceKind} {c.sourceId} “{c.sourceTitle}”
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.abstained && result.closestRelated.length > 0 && (
              <div className="border-t border-neutral-800 px-3 py-2 text-xs text-neutral-400">
                Closest related: {result.closestRelated.map((e) => e.name).join(", ")}
              </div>
            )}
          </section>

          <section className="panel flex min-h-0 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 text-xs">
              <button type="button" className={tab === "path" ? "text-emerald-300" : "text-neutral-500"} onClick={() => setTab("path")}>
                Path list
              </button>
              <button type="button" className={tab === "cypher" ? "text-emerald-300" : "text-neutral-500"} onClick={() => setTab("cypher")}>
                Cypher
              </button>
              <span className="ml-auto font-mono text-neutral-600">{result.pathIds.length} nodes</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-3 py-3 text-sm">
              {tab === "path" && (
                <div className="space-y-2 font-mono text-xs">
                  {result.decision ? (
                    <>
                      <div>
                        <span className="text-neutral-500">Q</span>
                        <span className="text-neutral-600"> ──► </span>
                        <span className="text-emerald-300">{result.decision.id}</span> “{result.decision.title}” ({result.decision.status}, {fmt(result.decision.decidedAt)})
                      </div>
                      {result.decision.chose.map((c) => (
                        <div key={c.id} className="pl-4 text-neutral-400">├─CHOSE──► {c.name} <span className="text-neutral-600">{c.id}</span></div>
                      ))}
                      {result.decision.rejected.map((c) => (
                        <div key={c.id} className="pl-4 text-neutral-400">├─REJECTED─► {c.name} <span className="text-neutral-600">({c.reason})</span></div>
                      ))}
                      {result.decision.reasons.map((r) => (
                        <div key={r.id} className="pl-4 text-neutral-400">
                          ├─BECAUSE─► {r.id} <span className="text-neutral-500">{r.kind}</span> — {r.text.slice(0, 80)}
                          <div className="pl-6 text-neutral-600">
                            {r.passages.map((p) => (
                              <div key={p.id}>└ SUPPORTED_BY {p.id} · {p.sourceTitle}</div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {result.decision.decidedBy.map((p) => (
                        <div key={p.id} className="pl-4 text-neutral-400">├─DECIDED_BY─► {p.name}</div>
                      ))}
                      {result.decision.approvedBy.map((p) => (
                        <div key={p.id} className="pl-4 text-neutral-400">└─APPROVED_BY─► {p.name}</div>
                      ))}
                      {result.decision.supersededBy.map((s) => (
                        <div key={s.id} className="pl-4 text-amber-400/80">⚠ SUPERSEDED_BY {s.id} “{s.title}”</div>
                      ))}
                    </>
                  ) : (
                    <div className="text-neutral-500">No decision path. Entities: {result.entities.map((e) => e.name).join(", ") || "none"}.</div>
                  )}
                </div>
              )}
              {tab === "cypher" && (
                <div className="space-y-3">
                  {result.cypher.map((c, i) => (
                    <div key={i} className="rounded border border-neutral-800 bg-neutral-900/50 p-2">
                      <pre className="whitespace-pre-wrap text-[11px] text-neutral-300">{c.query.trim()}</pre>
                      <pre className="mt-1 text-[10px] text-neutral-600">{JSON.stringify(c.params, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {drawer && (
        <aside className="panel fixed bottom-4 right-4 z-20 max-h-[50vh] w-[min(28rem,calc(100vw-2rem))] overflow-auto shadow-2xl">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <div className="text-xs font-medium text-neutral-200">
              {drawer.type === "passage" ? (
                <>{drawer.sourceKind} {drawer.sourceId} · {drawer.id}</>
              ) : (
                <>{drawer.kind} {drawer.id} · {drawer.title}</>
              )}
            </div>
            <button type="button" className="btn text-xs" onClick={() => setDrawer(null)}>Close</button>
          </div>
          <div className="space-y-2 px-3 py-3 text-sm">
            {drawer.type === "passage" && (
              <p className={highlight === drawer.id ? "rounded bg-emerald-950/50 p-2 text-emerald-100" : ""}>{drawer.text}</p>
            )}
            {drawer.type === "source" &&
              drawer.passages?.map((p) => (
                <p key={p.id} className={highlight === p.id ? "rounded bg-emerald-950/50 p-2 text-emerald-100" : "text-neutral-300"}>
                  <span className="font-mono text-[10px] text-neutral-600">{p.id}</span> {p.text}
                </p>
              ))}
          </div>
        </aside>
      )}
    </div>
  );
}
