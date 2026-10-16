# Crewbrain

Shared memory graph for a crew of AI agents and the people they work for. Every answer comes with the path through the graph that produced it.

Built during [Graph Hacks](https://www.wemakedevs.org/hackathons/falkordb) (15–18 Oct 2026) on FalkorDB.

Tracks: Agent Memory and Coordination; Company Brain.

See [DISCLOSURE.md](./DISCLOSURE.md) for what existed before the event and what is new.

## Status

**Day 2 (in progress):** memory engine (episodes, semantic recall with heat, supersede / as-of), Ask + Trace UI, memory timeline, review queue, and LLM-free ingest of one short demo chat. Day 1 foundation (schema, Acme seed, decision-trace CLI) remains. No hosted deployment yet — local FalkorDB only.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js (App Router) + Tailwind. Ask, Timeline, Review, Ingest + API routes |
| `packages/graph` | FalkorDB client, `TenantGraph`, migrations, trace, memory, ingest |
| `seed/` | Fictional Acme Learning corpus, structured decisions, demo R2 chat |
| `scripts/` | `migrate`, `seed`, `ask` CLIs |
| `tests/` | vitest suites against a real FalkorDB |

FalkorDB is the only datastore. Each tenant is its own graph (`t_registry`, `t_acme`, `t_sbx_<id>`).

## Local setup

Requirements: Node 22+, pnpm, and FalkorDB.

```bash
# 1. FalkorDB (Browser on http://localhost:3000)
docker compose up -d falkordb

# 2. Install
pnpm install
cp .env.example .env   # optional; defaults to redis://localhost:6379

# 3. Schema + seed (includes a few demo semantic memories)
pnpm migrate
pnpm seed              # add --reset to wipe t_acme first

# 4. Ask (CLI)
pnpm ask "Why did we choose Backblaze over Neon storage?"
pnpm ask "Why did we choose Backblaze over Neon storage?" --as-of 2026-08-01

# 5. Tests (needs FalkorDB running)
pnpm test

# 6. Web UI on http://localhost:8080
pnpm dev
```

### Demo path (browser)

1. **Ask** — “Why did we choose Backblaze over Neon storage?” → answer + path list + Cypher tab. Click a `[n]` citation to open the passage.
2. **Ingest** — Load the R2 sample chat → ingest → opens a proposal that partly supersedes D-07.
3. **Review** — Approve as Asha (Person only; agents are rejected by the API) → D-07 gets `valid_to`, new decision is written.
4. **Ask** again with **as of** 1 Sep 2026 → old B2 answer; as of now → D-07 no longer valid for that question.
5. **Timeline** — filter by type / as-of slider date.

Cut for Day 2: no LLM extraction on arbitrary pastes (hand-written seed + one structured R2 proposal). Sandbox tenants and Playwright are Day 2 evening / Day 3.

## Free stack

- FalkorDB (local Docker now; Cloud free instance needed for deploy)
- Graph-only answers by default (no paid AI). Optional free Groq later.
