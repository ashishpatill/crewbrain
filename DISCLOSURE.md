# Disclosure

**What existed before Graph Hacks (15 Oct 2026, 12:01 AM IST)**

I maintain two earlier projects: **grok-kit**, a plugin and skill kit for Cursor and Grok Build, and **bot-memory**, a Postgres + pgvector memory store for my own AI assistants. Both were built before this hackathon and are **not** part of this submission.

**What I reused from them:**

- the grok-kit plugin shell, used only to connect my existing Cursor/Grok Build agents to this project's new MCP endpoint in the demo;
- design ideas from my earlier memory design doc: memory tiers, review before procedural memory becomes durable, handoffs that must carry evidence, and superseding facts instead of overwriting them;
- [only if used] the bot-memory export file format, read by a new importer for a local-only private tenant, and a small secret-scrubbing regex list (commit linked).

**What is new and was built during the event (15-18 Oct 2026):** everything in this repository. That includes the FalkorDB graph schema and every Cypher query, the ingest and entity-resolution pipeline, the memory engine (episodic, semantic and procedural memory, supersede, as-of), the decision-trace engine and citation validator, task claiming and handoffs, the MCP endpoint, the agent runner, the whole web UI, the synthetic demo data and the deployment. FalkorDB is the only database the app uses. Neither the earlier Postgres store nor any of its code runs in this project. The repo's first commit was made after the event started, and the commit history shows the build.

**Tools:** I used AI coding assistants. I reviewed the code and can explain every part of it. Open-source libraries are listed in `package.json`. Models are free-tier Groq and OpenRouter models and a local MiniLM embedding model.

**Demo data** is fictional ("Acme Learning"). It contains no real customer or personal data.
