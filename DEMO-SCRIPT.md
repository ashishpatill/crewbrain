# Crewbrain demo recording script — NEW UI (post-revamp, not the current live UI) (~110 seconds; acceptable range 90–120s — use the HOLDs, don't rush the clicks)

Setup: Chrome full width, 150% zoom (Ctrl/+ twice), open https://crewbrain-lilac.vercel.app/ — it redirects to /start. Tenant selector (top bar) must say: acme (Harborlight demo). Have the upload sample ready on this machine: /workspace/demo-upload-sample.md (same file is in the repo at demo/demo-upload-sample.md).
Pre-flighted live state (verified 18 Oct 2026, evening IST): D-07 partially superseded by approved signed-URL decision D-191925f2, acme proposals contain only PR-e1410734 (approved, decidedBy nia on the proposal record) and no pending proposals, Agents scenario task TK-8b6b523f done with 3 handoffs, sandbox sbx_10eqlo5c (t_sbx_10eqlo5c, expires ~19 Oct 18:37 IST — if expired, create a new one in step 7 and use its id). The gift-wrap sample is NOT in the acme graph yet (checked: an Ask about kraft paper / twine abstains with 0 citations), so the upload in step 3 creates a fresh proposal on the first take.

Narration honesty line (say or show on screen): "This is the fictional Harborlight Outfitters demo company, disclosed in the banner. Everything else is real: every answer, write and claim runs against live FalkorDB — no mocks, no model faking answers."

## Click path

1. START (0:00–0:20) — /start is already open ("Start with your requirement").
   - Type in the requirement box (the big box at top): "Why did we pick Stripe instead of Adyen?" Click "Start →". (Suggestion chips sit under it; the Stripe chip does the same in one click.)
   - Expected on screen (verified on production acme, 18 Oct evening): outcome "answered", and this exact stage list — received: done, ask: done "answered by decision D-04", task: skipped, claim: skipped, execution: skipped, review: done "no pending proposals". Below it, the traced answer with 4 citations. (On a later retake, if an earlier take left the step-3 upload proposal pending, the review stage instead reads stopped and names that proposal — both are truthful; don't pause for it.)
   - HOLD 6s on the rendered stage list. Say: "Start with a requirement, not a dashboard. It traced this against the graph first — answered by decision D-04, with citations — so no task was needed. Stages it didn't need are skipped, not hidden."
   - Point at the citations under the answer. Say: "Every claim traces to a passage in the graph."

2. ASK (0:20–0:42) — click Ask in the left nav.
   - FIRST set "As of" to "date" (the date field already shows 2026-09-01) — do this before asking. As of now this question abstains: today's approved D-191925f2 partly superseded D-07, so D-07 is no longer current (verified live: as-of-now = abstained, 0 citations; as-of 2026-09-01 = D-07, 7 citations). The date is the honest opening.
   - Question is pre-filled: "Why did we choose Amazon S3 over MySQL for media storage?" Click Ask.
   - Say: "As of 1 September — before today's change partly superseded it — a traced answer. Decision D-07, rejected options with reasons, and citations I can click."
   - Expected on screen: answer header reads "as of 1 Sep 2026", decision node D-07 "Product media originals in Amazon S3" in the path list, and 7 citations under Sources ([1] = P-11-0, ticket S-11 "PLAT-41: Store media originals in Amazon S3, not in MySQL").
   - HOLD 8s on the Ask result, then click citation [1]. Say: "Every citation opens the real passage in the graph."
   - Click example "Why did we choose MongoDB?" Say: "Nothing recorded — it abstains instead of guessing." (This is the script's one abstention beat — keep it here, don't add another.)

3. INGEST — FILE UPLOAD (0:42–0:57) — click Ingest in the left nav. HOLD on the result panel until the narration finishes.
   - Drag /workspace/demo-upload-sample.md onto the upload drop zone (or use the file picker and select it). The Title field becomes "demo-upload-sample.md" and the text box fills with the file. Leave Kind and Author as they are. Click "Ingest → propose".
   - Upload rules shown on the page (say them if asked, don't volunteer a lecture): .txt/.md/.json/.csv/.log and .pdf (text PDFs only), 512 KB max; scanned/image-only PDFs fail (no OCR); DOCX not supported yet — no parser, and the page says so.
   - Expected on screen, first take in acme (verified with this exact file in a production sandbox, 18 Oct): "Wrote S-ing-… with 4 passages." and "Opened proposal PR-… — Review it →". The ids differ in acme; the counts don't. (On a retake with the same file, ingest is idempotent by hash: same source, and the same still-pending proposal id comes back.)
   - Say: "A real file upload now — same pipeline as paste. No LLM: it chunked the file into a Source with four Passages in FalkorDB, and opened a reviewable proposal. This gift-wrap topic is new — it wasn't in the graph before this upload."

4. REVIEW (0:57–1:12) — click Review, set Status = all.
   - HOLD 6s on the cards. Expected on screen: TWO proposals — the new memory proposal from step 3, status pending (by ashish), and PR-e1410734, decision, approved, "by ashish" on the card.
   - Do NOT approve the new upload proposal on camera, and say why: "This new proposal stays pending on purpose. Approving writes a permanent Memory into the live acme graph that the agents then recall — that decision is a human's, after the recording, not a demo click. Agents cannot approve at all; the API checks the actor is a Person."
   - For PR-e1410734, two different names, two different jobs — do not merge them: the card reads "by ashish" and its JSON says decided_by "ashish", approved_by null. That is Ashish, who raised/decided this signed-URL decision in the #infra chat. The person who approved the proposal is Nia: the production proposal record PR-e1410734 has decidedBy "nia", and D-191925f2 was written with DECIDED_BY Ashish / APPROVED_BY Nia. "Decide as" defaulting to Nia (founder) in the dropdown is a separate fact about NEW decisions — it is not who raised this one.
   - Say: "This one was Ashish's call — decided_by Ashish on the card — and Nia approved it. A real Person approved it: agents cannot approve, the API checks the actor is a Person. Approving wrote decision D-191925f2, decided by Ashish and approved by Nia, and closed D-07 with valid_to — superseded, never overwritten. For the next decision, Decide as still defaults to Nia."
   - Say: "That is why step 2 asked as of 1 September — D-07 was still current then. Time travel is just valid_from / valid_to in the graph."

5. AGENTS (1:12–1:32) — click Agents.
   - Board shows TK-8b6b523f done, 3 handoffs with evidence. Say: "The scripted scenario performs real graph writes: researcher claims atomically, writes sourced memories, hands off with evidence; coder learns only from its context card; reviewer sends it back; coder finishes."
   - Click "Race test: 8 agents x 50 tasks". Say: "Eight agents, fifty tasks, one compare-and-set claim query — zero double claims, live." Then HOLD 6s on the Agents board after the race test finishes.

6. MANUAL CONTROLS (1:32–1:40) — stay on Agents.
   - HOLD 5s with the claim/handoff controls area in view. Point at the claim/handoff controls. Say: "The board is not read-only any more — manual claim, handoff with evidence ids, and accept use the same graph operations. A handoff with no evidence is rejected."

7. SANDBOX / TENANT SWITCH (1:40–1:50) — click Sandboxes, then Open on t_sbx_10eqlo5c (or New sandbox → Open in Ask).
   - Top-bar tenant selector now shows the sandbox. Ask is open on the sandbox graph.
   - Ask "Why did we keep notes in Markdown?" HOLD 6s on the sandbox answer once it loads. Say: "A different company, a different graph — its own tiny decision. One graph per tenant." (Don't ask the S3 question here — the Mongo beat in step 2 is the script's only abstention.)
   - Switch tenant selector back to acme before ending.

## Do not claim
- No paid/model answers: banner says graph-only. Seed company is fictional and disclosed.
- Ingest does no LLM extraction: chunking + proposal only. File upload reads plain-text files (.txt/.md/.json/.csv/.log) and text PDFs (.pdf); scanned/image-only PDFs and DOCX are not supported.
- Retrieval is alias/fuzzy for decisions plus keyword matching over passages — not semantic search. No autonomous agent executes beyond claiming a task; execution and approvals are human/manual, and the Start page labels stopped stages as stopped.
