# Crewbrain demo recording script (~90 seconds)

Setup: Chrome full width, 150% zoom (Ctrl/+ twice), open https://crewbrain-lilac.vercel.app/ask
Tenant selector (top bar) must say: acme (Harborlight demo)
Pre-flighted live state (18 Oct 2026, IST): D-07 partially superseded by approved signed-URL decision D-191925f2, Agents scenario task TK-8b6b523f done with 3 handoffs, sandbox sbx_10eqlo5c (t_sbx_10eqlo5c, expires ~19 Oct 18:37 IST — if expired, create a new one in step 6 and use its id).

Narration honesty line (say or show on screen): "This is the fictional Harborlight Outfitters demo company, disclosed in the banner. Everything else is real: every answer, write and claim runs against live FalkorDB — no mocks, no model faking answers."

## Click path

1. ASK (0:00–0:25) — /ask is already open.
   - Question is pre-filled: "Why did we choose Amazon S3 over MySQL for media storage?" Click Ask.
   - Say: "A traced answer. Decision D-07, rejected options with reasons, and citations I can click."
   - Click citation [1]. Say: "Every citation opens the real passage in the graph."
   - Click example "Why did we choose MongoDB?" Say: "Nothing recorded — it abstains instead of guessing."

2. INGEST (0:25–0:40) — click Ingest in left nav.
   - Click "Load sample chat", then "Ingest → propose".
   - Say: "No LLM. It chunks the chat into Source and Passage nodes. Because this run is pre-flighted, re-ingesting is idempotent — it returns the same source instead of duplicating it. Any document now opens a reviewable proposal; this signed-URL chat opened a decision proposal."
   - (If recording on a fresh graph: the result shows a new proposal id — use that in step 3.)

3. REVIEW (0:40–0:55) — click Review, set Status = all.
   - Show PR-e1410734 approved, decided by nia. "Decide as" defaults to Nia (founder).
   - Say: "First click works — the approver defaults to a real person, Nia. Agents cannot approve; the API checks the actor is a Person. Approving wrote decision D-191925f2 and closed D-07 with valid_to — superseded, never overwritten."
   - Go back to Ask, set As of = date 2026-09-01, Ask the S3 question again. Say: "As of 1 September, the old answer. Time travel is just valid_from / valid_to in the graph."

4. AGENTS (0:55–1:15) — click Agents.
   - Board shows TK-8b6b523f done, 3 handoffs with evidence. Say: "The scripted scenario performs real graph writes: researcher claims atomically, writes sourced memories, hands off with evidence; coder learns only from its context card; reviewer sends it back; coder finishes."
   - Click "Race test: 8 agents x 50 tasks". Say: "Eight agents, fifty tasks, one compare-and-set claim query — zero double claims, live."

5. MANUAL CONTROLS (1:15–1:22) — stay on Agents.
   - Point at the claim/handoff controls. Say: "The board is not read-only any more — manual claim, handoff with evidence ids, and accept use the same graph operations. A handoff with no evidence is rejected."

6. SANDBOX / TENANT SWITCH (1:22–1:30) — click Sandboxes, then Open on t_sbx_10eqlo5c (or New sandbox → Open in Ask).
   - Top-bar tenant selector now shows the sandbox. Ask is open on the sandbox graph.
   - Ask "Why did we keep notes in Markdown?" Say: "A different company, a different graph — its own tiny decision."
   - Ask the S3 question. Say: "And the Harborlight decision honestly abstains here. One graph per tenant."
   - Switch tenant selector back to acme before ending.

## Do not claim
- No paid/model answers: banner says graph-only. Seed company is fictional and disclosed.
- Ingest does no LLM extraction: chunking + proposal only.
