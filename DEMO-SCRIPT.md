# Crewbrain demo recording script — finished UI (Home + unified run) (~2 minutes; acceptable 1:50–2:10 — use the HOLDs, don't rush clicks)

Live site: https://crewbrain-lilac.vercel.app — verified post-push 18 Oct 2026, evening IST (Asia/Calcutta), production head `900a496`, Vercel deployment `dpl_9LycQWhnRNcSy3jEeXVa1vhxPKp7` READY.

Setup: Chrome full width, 150% zoom (Ctrl/+ twice). Have the upload sample ready on this machine: `/workspace/demo-upload-sample.md` (same file is in the repo at `demo/demo-upload-sample.md`).

## Pre-flight (do this BEFORE recording, not on camera)

1. Open **Sandboxes** and click **New sandbox**. Note the new id (it looks like `sbx_xxxxxxxx`). This fresh sandbox is the upload tenant for step 4 and the tenant-switch tenant for step 6. It expires 24 hours after creation.
   - Do **not** use `sbx_ulajgxtd` for the take: the 18 Oct live smoke left a pending PDF proposal (`PR-6bdc8ee1`) and a gift-wrap proposal in it.
   - Do **not** use the older `sbx_10eqlo5c` either: it has extra nodes from earlier takes.
2. Switch the top-bar tenant selector back to **acme (Harborlight demo)** before pressing record. Steps 1–3 are acme-only.
3. Live acme state verified 18 Oct 2026 evening IST: **no pending proposals** (only three approved ones: `PR-e1410734`, `PR-4c5cf66f`, `PR-32d14b75` — gift-wrap is already approved in acme, which is exactly why step 4 uploads that file in the fresh sandbox, not in acme). Acme's Agents board also shows, besides the finished scenario task, the claimed Zorblax task from the live smoke — that is expected, not a glitch.
4. The header's global Run indicator follows the latest run in the selected tenant. After step 2 it should read along the lines of "Run · stage 6 of 6 · Review pending proposals · done" on other pages; in the upload sandbox it follows that tenant's run instead.

Narration honesty line (say or show on screen): "This is the fictional Harborlight Outfitters demo company, disclosed in the banner. Everything else is real: every answer, write and claim runs against live FalkorDB — no mocks, no model faking answers."

## Click path

1. **HOME (0:00–0:15)** — open https://crewbrain-lilac.vercel.app/ (it now lands on the Home page, not a redirect).
   - Expected on screen: hero "Crewbrain — a shared memory graph for agent teams", the feature-card grid ("Decision graph + as-of time travel", "Cited Ask with honest abstention", "Document ingest (text PDFs included)", "Requirement-first Start (unified run)", "Agent task claiming", "Per-tenant sandboxes", "Handoffs with evidence"), "How it works", and the "Honest limits" card.
   - HOLD 4s, scrolling slowly through the feature cards. Say: "Crewbrain is a shared memory graph for agent teams — decisions with reasons, citations, and human approval."
   - Click **Start a run**.

2. **START — ANSWERED RUN (0:15–0:35)** — on /start, click the suggestion chip "Why did we pick Stripe instead of Adyen?".
   - Expected on screen (verified live on acme 18 Oct): outcome `answered`; stages received/ask done ("answered by decision D-04"), task/claim/execution skipped, review done; the traced answer with **4 citations** below; "Next action: Nothing needed — answered".
   - HOLD 5s on the stage timeline, then point at the header. Say: "One run, driven by the requirement. It asked memory first and the graph answered from decision D-04 with citations — so no task was created, and the stages it didn't need are skipped, not hidden. This Run indicator now follows me across every page."

3. **ASK AS-OF (0:35–0:52)** — click **Ask** (note the Run indicator still in the header).
   - FIRST set "As of" to **date** (the field already shows 2026-09-01) — before asking. The question is pre-filled: "Why did we choose Amazon S3 over MySQL for media storage?" Click **Ask**.
   - Expected on screen (verified live 18 Oct): answer header "as of 1 Sep 2026", decision **D-07** "Product media originals in Amazon S3" in the path list, **7 citations** under Sources. Asking as of *now* abstains instead — D-07 was partly superseded later — so the date is the honest opening.
   - HOLD 5s. Say: "As of 1 September, before a later change partly superseded it: decision D-07, rejected options with reasons, and citations I can click. Time travel is just valid-from / valid-to in the graph."
   - (Optional only if a take runs short: click citation [1] to open the real passage. Do not add the MongoDB abstention beat — it is already described in the Home card, and the clock needs step 4 clean.)

4. **UPLOAD IN-RUN + PROPOSAL IN-RUN (0:52–1:32)** — the clean demo path, in the **fresh sandbox** from pre-flight.
   - Switch the top-bar tenant selector to the new sandbox id, open **Start**, and type this requirement in the big box: `What do we use at the gift-wrap station?`
   - BEFORE pressing Start: click **Upload file** and choose `/workspace/demo-upload-sample.md` (repo copy: `demo/demo-upload-sample.md`). The source panel opens with the file's text filled in. (A text PDF works the same way — it is extracted server-side first; scanned/image-only PDFs fail honestly, there is no OCR. This take uses the markdown sample because it is byte-identical to the verified run.)
   - Now click **Start →**.
   - Expected on screen in a fresh sandbox (verified live 18 Oct with this exact file, in the smoke sandbox): outcome `task_created`; ask done "no recorded decision or source citations"; a task created (TK-…, todo) with the claim stage **stopped** — "no agents in this tenant; task left todo", because a sandbox tenant has no crew agents; then ingest done with a new `S-ing-…` source, **4 passages**, and a **proposal stage stopped**: "human must approve: PR-…". The "Proposals in this run" panel shows that one proposal, pending. Ids differ in a fresh sandbox; the stage pattern does not.
   - HOLD 6s on the proposal panel. **Do NOT approve (or reject) it on camera**, and say why: "The document became a Source with four Passages and a pending proposal — inside the same run. It stays pending on purpose: approving writes permanent Memory into this graph, and only a Person can approve — agents cannot. That is a human's call after the recording."
   - Upload rules as shown on the page, if asked: `.txt/.md/.json/.csv/.log` and `.pdf` (text PDFs only), 512 KB max; scanned/image-only PDFs are rejected honestly (no OCR); DOCX is not supported yet.

5. **AGENTS RACE (1:32–1:48)** — switch the tenant selector back to **acme (Harborlight demo)**, click **Agents**.
   - The board shows the signed-URL scenario task (`TK-8b6b523f`, done, 3 handoffs with evidence) and the claimed Zorblax task from the live run. Click **"Race test: 8 agents x 50 tasks"**.
   - Expected on screen: the result line reports 50 claimed, **0 double claims**, plus the lost-race count and p50/p95 latency.
   - HOLD on the result line. Say: "Eight agents, fifty tasks, one compare-and-set claim query — zero double claims, live. The race creates RACE-* tasks, so they appear on the board; that is the run, not leftovers."

6. **SANDBOX QUESTION (1:48–2:00)** — switch the tenant selector to the **fresh sandbox**, click **Ask**.
   - Ask: `Why did we keep notes in Markdown?`
   - Expected on screen (verified live 18 Oct against a fresh sandbox graph): decision **D-01** "Keep notes in Markdown", with its citation — this sandbox's own seed decision. (Do not ask the S3 question here; the sandbox graph has no such decision and would abstain — that difference is the point, but do not spend seconds on the negative on this take.)
   - HOLD on the answer. Say: "A different company, a different graph — its own decision. One graph per tenant." End here; the tenant selector stays on the sandbox.

## Do not claim

- No organisation-level sandboxing exists today: isolation is per-tenant graphs only, sandboxes sit in one shared pool with a 24 h expiry and a cap of 20. Do not say "organisation" anywhere.
- No paid/model answers: the banner says graph-only. The seed company is fictional and disclosed.
- Stay off older sandboxes (`sbx_ulajgxtd`, `sbx_10eqlo5c`) for the take and keep the pre-flight's fresh sandbox for steps 4 and 6. There is **no pending proposal in acme** to demo: the only fresh pending proposal on camera is the one step 4 creates, in the sandbox.
- Ingest does no LLM extraction: chunking + proposal only. File upload reads plain-text files (.txt/.md/.json/.csv/.log) and text PDFs (.pdf); scanned/image-only PDFs and DOCX are not supported.
- A sandbox tenant has no crew agents, so step 4's claim stage stopping is expected behaviour — say so rather than cutting around it. In acme an unanswerable requirement both creates **and** claims a task (the claimed Zorblax task on the board is the live proof).
- Retrieval is alias/fuzzy for decisions plus keyword matching over passages — not semantic search. No autonomous agent executes beyond claiming a task; execution and approvals are human/manual, and the run timeline labels stopped stages as stopped.
