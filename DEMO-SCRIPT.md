# Crewbrain demo recording script (~110 seconds; acceptable range 90–120s — use the HOLDs, don't rush the clicks)

Setup: Chrome full width, 150% zoom (Ctrl/+ twice), open https://crewbrain-lilac.vercel.app/ask
Tenant selector (top bar) must say: acme (Harborlight demo)
Pre-flighted live state (18 Oct 2026, IST): D-07 partially superseded by approved signed-URL decision D-191925f2, Agents scenario task TK-8b6b523f done with 3 handoffs, sandbox sbx_10eqlo5c (t_sbx_10eqlo5c, expires ~19 Oct 18:37 IST — if expired, create a new one in step 6 and use its id).

Narration honesty line (say or show on screen): "This is the fictional Harborlight Outfitters demo company, disclosed in the banner. Everything else is real: every answer, write and claim runs against live FalkorDB — no mocks, no model faking answers."

## Click path

1. ASK (0:00–0:28) — /ask is already open.
   - FIRST set "As of" to "date" (the date field already shows 2026-09-01) — do this before asking. As of now this question abstains: today's approved D-191925f2 partly superseded D-07, so D-07 is no longer current (verified live 18 Oct: as-of-now = abstained, 0 citations; as-of 2026-09-01 = D-07, 7 citations). The date is the honest opening.
   - Question is pre-filled: "Why did we choose Amazon S3 over MySQL for media storage?" Click Ask.
   - Say: "As of 1 September — before today's change partly superseded it — a traced answer. Decision D-07, rejected options with reasons, and citations I can click."
   - Expected on screen: answer header reads "as of 1 Sep 2026", decision node D-07 "Product media originals in Amazon S3" in the path list, and 7 citations under Sources ([1] = P-11-0, ticket S-11 "PLAT-41: Store media originals in Amazon S3, not in MySQL").
   - HOLD 10–15s on the Ask result before touching anything (let the answer, D-07 node and the 7 citations sit readable on screen). Then click citation [1]. Say: "Every citation opens the real passage in the graph."
   - Click example "Why did we choose MongoDB?" Say: "Nothing recorded — it abstains instead of guessing." (This is the script's one abstention beat — keep it here, don't add another.)

2. INGEST (0:28–0:42) — click Ingest in left nav. HOLD on the result panel until the narration finishes.
   - Click "Load sample chat", then "Ingest → propose".
   - Expected on screen (re-recording, pre-flighted graph): "Wrote S-ing-6ccc with 2 passages. No proposal was opened." That is the correct result — do not wait for or describe a new proposal here.
   - Say: "No LLM. It chunks the chat into Source and Passage nodes. Because this graph is already pre-flighted, re-ingesting is idempotent: it returns the same source, S-ing-6ccc, with its 2 passages instead of duplicating it, and it opens no new proposal — the signed-URL decision proposal this chat originally opened is already approved, and you will see it in Review next."
   - (If recording on a fresh graph instead: the result shows a new source/proposal id — use that proposal in step 3.)

3. REVIEW (0:42–1:00) — click Review, set Status = all.
   - HOLD 8–10s on the PR-e1410734 card before narrating (let "approved", the "by omar" line and the payload JSON sit readable).
   - Two different names, two different jobs — say them exactly this way, do not merge them: the card reads "by omar" and its JSON says decided_by "omar", approved_by null. That is Omar, who raised/decided this signed-URL decision in the #infra chat (payload source S-ing-6ccc). The person who approved the proposal is Nia: the production proposal record PR-e1410734 has decidedBy "nia" (the API field for the approving actor; it is not the payload's decided_by), and D-191925f2 was written with DECIDED_BY Omar / APPROVED_BY Nia. "Decide as" defaulting to Nia (founder) in the dropdown is a separate fact about NEW decisions you are about to decide — it is not who raised this one.
   - Say: "This one was Omar's call — decided_by Omar on the card — and Nia approved it. A real Person approved it: agents cannot approve, the API checks the actor is a Person. Approving wrote decision D-191925f2, decided by Omar and approved by Nia, and closed D-07 with valid_to — superseded, never overwritten. For the next decision, Decide as still defaults to Nia."
   - Say: "That is why step 1 asked as of 1 September — D-07 was still current then. Time travel is just valid_from / valid_to in the graph." (No re-ask here: step 1 already showed the 1 Sep answer, and asking the same S3 question as of now abstains since the partial supersession.)

4. AGENTS (1:00–1:25) — click Agents.
   - Board shows TK-8b6b523f done, 3 handoffs with evidence. Say: "The scripted scenario performs real graph writes: researcher claims atomically, writes sourced memories, hands off with evidence; coder learns only from its context card; reviewer sends it back; coder finishes."
   - Click "Race test: 8 agents x 50 tasks". Say: "Eight agents, fifty tasks, one compare-and-set claim query — zero double claims, live." Then HOLD 10s on the Agents board after the race test finishes (let the done task, handoffs and race result sit readable; do not click away early).

5. MANUAL CONTROLS (1:25–1:35) — stay on Agents.
   - HOLD 8s with the claim/handoff controls area in view. Point at the claim/handoff controls. Say: "The board is not read-only any more — manual claim, handoff with evidence ids, and accept use the same graph operations. A handoff with no evidence is rejected."

6. SANDBOX / TENANT SWITCH (1:35–1:50) — click Sandboxes, then Open on t_sbx_10eqlo5c (or New sandbox → Open in Ask).
   - Top-bar tenant selector now shows the sandbox. Ask is open on the sandbox graph.
   - Ask "Why did we keep notes in Markdown?" HOLD 10s on the sandbox answer once it loads. Say: "A different company, a different graph — its own tiny decision. One graph per tenant." (Don't ask the S3 question here — the Mongo beat in step 1 is the script's only abstention.)
   - Switch tenant selector back to acme before ending.

## Do not claim
- No paid/model answers: banner says graph-only. Seed company is fictional and disclosed.
- Ingest does no LLM extraction: chunking + proposal only.
