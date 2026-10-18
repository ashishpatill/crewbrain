# Crewbrain

**A shared memory graph for a crew of AI agents and the people they work for. Every answer comes with the path through the graph that produced it.**

Built during [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb) (15–18 Oct 2026), on FalkorDB.
Tracks: **Agent Memory and Coordination** (main) and **Company Brain**. License: MIT.

## Demo

**[Watch the demo video](demo/crewbrain-demo.mp4)** (silent, ~1:38) · [Live demo](https://crewbrain-lilac.vercel.app)

The silent walkthrough shows the finished product on the live site, using the fictional Harborlight Outfitters demo data: the Home page, a unified run from Start driven by a plain-language requirement, Ask as of 1 Sep with citations, document ingest in the same run — plain-text files and text PDFs (no OCR for scanned/image-only PDFs; DOCX not yet supported) becoming a Source with passages and a pending proposal that only a Person can approve — the header pipeline indicator following the run across pages, the Agents race test, and a separate per-tenant sandbox graph. Agents claim tasks through the atomic claim; they do not execute them autonomously — execution and approvals stay human/manual, and stopped stages are labelled as stopped. Retrieval is alias/fuzzy matching for decisions plus keyword matching over passages, not semantic search, and isolation is per-tenant graphs only (visitor sandboxes expire after 24 hours, capped at 20) — there is no organisation-level sandboxing.

## For the submission

Crewbrain is more than doc retrieval. It stores decisions as a graph — what was chosen, what was rejected and why, the reasons, the supporting passages, the sources, and who decided and approved — and Ask answers by tracing that path, citing passages from that path, with a validator that rejects any citation outside the traced subgraph, and abstaining instead of guessing when nothing is recorded. Facts are superseded, never overwritten, so "what did we believe on 1 September?" still works. Agents share tasks through one atomic compare-and-set claim query, hand off work only when it carries real evidence, and start each session from a context card built from the graph. Each tenant is its own FalkorDB graph, with visitor sandboxes that expire after 24 hours and are capped at 20, and a memory meter per graph. Ingest chunks pasted or uploaded plain-text files (.txt, .md, .json, .csv, .log) and text PDFs (no OCR for scanned/image-only; DOCX not yet supported) into Source and Passage nodes with hashed idempotency and opens reviewable proposals that only a Person can approve; procedural memory always becomes a proposal. A Start page runs the real pipeline from a plain-language requirement — Ask first, then task creation and a real agent claim — and stops honestly where human approval or manual work is required. Retrieval today is alias and entity matching with fuzzy Jaro-Winkler for decisions, plus plain keyword matching over passage text for source recall — not semantic search — and the declared vector and fulltext indexes are not yet used. All answers are graph-only, with no model faking them.

## Why

Teams now run several AI agents: a researcher, a coder, a reviewer, an ingest bot. Each one forgets everything between sessions, none of them knows what the others decided, and when one says "we chose Amazon S3", nobody can tell where that came from.

The questions people ask about this are questions about connections: *why* (decision → reason → source), *who knows* (person → project → system), *what did the reviewer hand the coder* (agent → handoff → task → memory). In a graph each of those is one Cypher query. Crewbrain keeps all of it in FalkorDB.

## What it does

| Feature | Where |
|---|---|
| **Home landing page.** Real landing page at `/`: hero, shipped-feature cards, how-it-works steps, and an honest-limits strip linking to `/roadmap`. Home is the overview; `/start` is the app entry where runs begin. | Home |
| **Unified requirement-first Run.** Started from Home/Start: Ask memory first; only if no decision is found, create a task and let an agent claim it via the atomic compare-and-swap claim; ingest documents inline in the same run (plain text + text PDFs, 512KB cap; scanned/image-only PDFs rejected honestly, no OCR); a pending proposal appears in the same run and only a Person can approve or reject it; re-asking after approval closes the loop. Stops honestly where human approval or manual work is required. The run persists as a `(:Run)` node in the tenant's own FalkorDB graph. | Start |
| **Computed "Next:" guidance.** Derived from real run state, tells the user the one next step to complete their goal. | Start |
| **CSS-only animated stage timeline.** Shows pipeline progress; respects `prefers-reduced-motion`. | Start |
| **Global header Run indicator.** `Run · stage X of Y · label · status` on every page, showing current pipeline position everywhere. | All pages (header) |
| **Ask why, with a trace.** Decisions link to chosen/rejected options, reasons, supporting passages, sources and deciders. The answer cites node ids, a validator rejects any citation not in the retrieved subgraph, and with no recorded decision it says so instead of guessing. | Ask, `pnpm ask` |
| **Memory over time.** Episodic (agent sessions and turns), semantic (sourced facts) and procedural (reviewed how-tos) memory. Facts are superseded, never overwritten, so "what did we believe on 1 Sep?" still works. | Timeline, Review, Ingest |
| **Document ingest.** Pasted or uploaded plain-text files (.txt, .md, .json, .csv, .log) and text PDFs chunk into Source and Passage nodes with hashed idempotency; opens reviewable proposals that only a Person can approve; procedural memory always becomes a proposal. 512KB cap; scanned/image-only PDFs rejected (no OCR); DOCX not supported. | Ingest |
| **Review proposals.** Pending proposals approved or rejected by a Person only; agents cannot approve their own work. | Review |
| **Shared tasks with an atomic claim.** One Cypher query compares the task version and claims it; at most one concurrent agent wins. | Agents |
| **Handoffs with evidence + context cards.** A handoff without at least one existing Memory, Passage or Decision is rejected. The receiver's next session starts from a context card built from the graph. | Agents |
| **Race test.** 8 agents claim 50 tasks at once; the graph is then checked for double claims. | Agents, tests |
| **One graph per tenant.** `t_acme`, plus visitor sandboxes `t_sbx_<8>` (24 h lifetime, cap 20). No organisation-level sandboxing; isolation is one graph per tenant only. A `GRAPH.MEMORY USAGE` meter shows each graph's size. | Sandboxes |

No paid AI: answers are built from the graph path ("graph-only mode"). An optional free-tier model can be added later; the product never fakes a model answer.

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    UI["Next.js UI<br/>Home · Start · Ask · Timeline · Review · Ingest · Agents · Sandboxes · Roadmap"]
    CLI["CLI<br/>migrate · seed · ask"]
  end
  subgraph App["apps/web API routes (stateless)"]
    API["tenant guard<br/>(graph key from tenant, never raw input)"]
  end
  subgraph Engine["packages/graph"]
    TRACE["Trace engine<br/>entity resolve → Cypher → cited answer → validator"]
    MEM["Memory engine<br/>episodes · semantic · procedural<br/>supersede · as-of · heat"]
    COORD["Coordination<br/>tasks · CAS claim · handoffs<br/>context card · race test"]
    SBX["Tenants<br/>registry · sandboxes · memory meter"]
  end
  subgraph FalkorDB
    REG[("t_registry")]
    ACME[("t_acme")]
    SB[("t_sbx_*")]
  end
  UI --> API --> TRACE & MEM & COORD & SBX
  CLI --> TRACE
  TRACE & MEM & COORD --> ACME
  SBX --> REG & SB
```

Every repository function takes a `TenantGraph` bound to exactly one graph key, so no query can reach another tenant's graph.

### Agent coordination model

```mermaid
flowchart LR
  A[Agent] -- CLAIMED_BY --- T[Task<br/>status · version]
  H[Handoff] -- FROM --> A1[Agent]
  H -- TO --> A2[Agent]
  H -- OF --> T
  H -- CARRIES --> M[Memory / Passage / Decision]
  M -- WRITTEN_BY --> A1
  M -- SCOPED_TO --> P[Project]
  A2 -- WORKS_ON --> P
  A1 -- HAD --> E[Episode] -- HAS_TURN --> TU[Turn]
```

The claim is a single query:

```cypher
MATCH (t:Task {id: $id}), (a:Agent {id: $agent})
WHERE t.version = $v AND (t.status = 'todo' OR (t.status = 'handed_off' AND t.assigned_to = $agent))
SET t.status = 'claimed', t.claimed_by = $agent, t.version = t.version + 1
MERGE (t)-[:CLAIMED_BY]->(a)
RETURN t
```

Zero rows back means another agent won. FalkorDB executes each write query atomically on a graph, so this is a compare-and-set.

**Scenario "Add signed URLs for lookbook videos"** (Agents page → Run scenario): `researcher` claims the task, writes two sourced memories and hands off to `coder`. `coder` starts a fresh session; its context card already lists the handoff and the researcher's memories. `coder` hands to `reviewer`, which flags a missing link expiry (citing the researcher's memory) and hands back. `coder` finishes. Every step is nodes and edges in the graph; nothing passes between agents in process memory.

### Concurrency (measured locally)

Race test, 8 agents × 50 tasks against a local FalkorDB, one shared client connection: **50 claimed, 0 double claims**, ~80–95 lost races (expected: agents retry), claim latency p50 ≈ 2.4 ms, p95 ≈ 3.6 ms. Numbers on FalkorDB Cloud will differ; the Agents page shows the live run.

## How to run

Requirements: Node 22+, pnpm, FalkorDB.

```bash
docker compose up -d falkordb          # FalkorDB on :6379, Browser on :3000
pnpm install
cp .env.example .env                    # FALKORDB_URL, defaults to redis://localhost:6379
pnpm migrate && pnpm seed               # schema + Harborlight demo graph (add --reset to wipe)
pnpm ask "Why did we choose Amazon S3 over MySQL for media storage?"
pnpm test                               # vitest against a real FalkorDB (throwaway graph keys)
pnpm dev                                # UI on http://localhost:8080
```

### Demo path

1. **Ask** "Why did we choose Amazon S3 over MySQL for media storage?" → answer, path list, the Cypher that ran. Ask "Why did we choose MongoDB?" → honest "no recorded decision".
2. **Ingest** the signed-URL sample chat → a proposal that partly supersedes the S3 decision. **Review** → approve as Nia.
3. **Ask** again with *as of* 1 Sep → old answer; now → new answer. **Timeline** shows the change.
4. **Agents** → Run scenario, then Race test.
5. **Sandboxes** → New sandbox; the Amazon S3 question has no answer there (different company).

## Deploy (Vercel + FalkorDB Cloud)

- Vercel project with **Root Directory `apps/web`** (config in `apps/web/vercel.json`).
- Set `FALKORDB_URL` in the Vercel environment (`rediss://…` for TLS). It is read only from the environment.
- Seed once from a laptop: `FALKORDB_URL=… pnpm migrate && FALKORDB_URL=… pnpm seed`.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js App Router UI and API routes |
| `packages/graph` | FalkorDB client, `TenantGraph`, migrations, trace, memory, coordination, sandboxes |
| `seed/` | Fictional Harborlight corpus (40 sources), structured decisions, demo signed-URL chat |
| `scripts/` | `migrate`, `seed`, `ask` |
| `tests/` | vitest suites against a real FalkorDB |
