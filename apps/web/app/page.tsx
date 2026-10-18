import Link from "next/link";

const FEATURES = [
  {
    pill: "Shipped",
    title: "Decision graph + as-of time travel",
    body: "Decisions are nodes linked to chosen and rejected options, reasons, supporting passages, sources and deciders. Facts are superseded, never overwritten, so \"what did we believe on 1 Sep?\" still works.",
    href: "/timeline",
  },
  {
    pill: "Shipped",
    title: "Cited Ask with honest abstention",
    body: "Ask traces a subgraph and answers only from it, citing passage ids. A validator rejects any citation outside the traced subgraph; with no recorded decision it says \"no recorded decision\" instead of guessing.",
    href: "/ask",
  },
  {
    pill: "Shipped",
    title: "Document ingest (text PDFs included)",
    body: "Pasted or uploaded .txt/.md/.json/.csv/.log and text PDFs chunk into Source and Passage nodes with hashed idempotency, then open reviewable proposals. Scanned/image-only PDFs have no OCR and are rejected honestly. DOCX is not supported yet.",
    href: "/ingest",
  },
  {
    pill: "Shipped",
    title: "Requirement-first Start (unified run)",
    body: "Start runs the real pipeline from a plain-language requirement: Ask first, then task creation and a real agent claim, with proposals in-run and a re-ask after approval. It stops honestly where human approval or manual work is required.",
    href: "/start",
  },
  {
    pill: "Shipped",
    title: "Agent task claiming (no double-claims)",
    body: "One atomic compare-and-set Cypher query claims a task; at most one concurrent agent wins. Measured: 8 agents x 50 tasks, 50 claimed, 0 double claims.",
    href: "/agents",
  },
  {
    pill: "Shipped",
    title: "Per-tenant sandboxes",
    body: "Each tenant is its own FalkorDB graph (t_acme, t_sbx_*). Visitor sandboxes live 24 h, are capped at 20, and show a GRAPH.MEMORY USAGE meter per graph.",
    href: "/sandbox",
  },
  {
    pill: "Shipped",
    title: "Handoffs with evidence + context cards",
    body: "A handoff without at least one existing Memory, Passage or Decision is rejected. The receiver's next session starts from a context card built from the graph.",
    href: "/agents",
  },
];

const STEPS = [
  "Ingest a document or paste a requirement - Ask memory first.",
  "Trace the graph and propose changes (proposals only, never auto-applied).",
  "A human approves or rejects each proposal (agents cannot approve).",
  "Agents claim tasks atomically and hand off with evidence; re-ask the original question.",
];

export default function Home() {
  return (
    <div className="flex flex-col gap-8 min-w-0">
      <section className="flex flex-col gap-4">
        <div>
          <h1 className="page-title">Crewbrain</h1>
          <p className="mt-1 text-lg font-medium text-emerald-300 sm:text-xl">
            a shared memory graph for agent teams
          </p>
          <p className="page-desc">
            decisions with reasons, citations, human approval
          </p>
        </div>
        <p className="max-w-2xl text-sm text-neutral-300">
          Graph-only answers - no paid model. Built on FalkorDB. Demo data is the fictional Harborlight
          Outfitters company; nothing here is a real customer.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/start" className="btn btn-primary">
            Start a run
          </Link>
          <Link href="/ask" className="btn">
            Ask
          </Link>
          <Link href="/ingest" className="btn">
            Ingest
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">What exists today</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`card flex flex-col gap-2 min-w-0 ${i === FEATURES.length - 1 && FEATURES.length % 3 === 1 ? "sm:col-span-2 lg:col-span-3" : ""}`}>
              <div>
                <span className="pill pill-done">{f.pill}</span>
              </div>
              <div className="text-sm font-medium text-neutral-100 break-words">{f.title}</div>
              <div className="text-xs text-neutral-400 break-words">{f.body}</div>
              <Link href={f.href} className="mt-auto text-xs text-emerald-400 hover:underline">
                Open
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">How it works</h2>
        <ol className="flex flex-col gap-2">
          {STEPS.map((s, i) => (
            <li key={i} className="card flex items-start gap-3 min-w-0">
              <span className="font-mono text-sm text-emerald-300">{i + 1}.</span>
              <span className="text-sm text-neutral-200 break-words">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card border-amber-900/60 bg-amber-950/20">
        <div className="mb-2">
          <span className="pill pill-stopped">Honest limits</span>
        </div>
        <ul className="list-disc pl-5 text-xs text-neutral-300 space-y-1">
          <li>Retrieval today is alias and entity matching with fuzzy Jaro-Winkler for decisions, plus plain keyword matching over passage text for source recall - not semantic search. The declared vector and fulltext indexes exist but are unused.</li>
          <li>Agents claim tasks but do not execute beyond claiming. Execution and approvals stay human.</li>
        </ul>
        <div className="mt-3">
          <Link href="/roadmap" className="text-xs text-emerald-400 hover:underline">
            See the roadmap
          </Link>
        </div>
      </section>

      <section className="card">
        <div className="mb-2">
          <span className="pill pill-skipped">Demo</span>
        </div>
        <div className="text-sm font-medium text-neutral-100">Watch the demo</div>
        <p className="mt-1 text-xs text-neutral-400">
          The demo video link is in the README (demo/crewbrain-demo.mp4). It is not served from this site.
        </p>
      </section>
    </div>
  );
}
