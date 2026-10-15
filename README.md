# Crewbrain

Shared memory graph for a crew of AI agents and the people they work for. Every answer comes with the path through the graph that produced it.

Built during [Graph Hacks](https://www.wemakedevs.org/hackathons/falkordb) (15-18 Oct 2026) on FalkorDB.

Tracks: Agent Memory and Coordination; Company Brain.

See [DISCLOSURE.md](./DISCLOSURE.md) for what existed before the event and what is new.

## Status

Day 1 foundation: FalkorDB schema, fictional Acme Learning seed, decision-trace engine and `ask` CLI. No hosted deployment yet.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js (App Router) + Tailwind. `/api/health` runs a real FalkorDB query |
| `packages/graph` | FalkorDB client, `TenantGraph` (one handle per graph key), migrations, queries |
| `seed/` | Fictional Acme Learning corpus and structured decisions |
| `scripts/` | `migrate`, `seed`, `ask` CLIs |
| `tests/` | vitest suites that run against a real FalkorDB |

FalkorDB is the only datastore. Each tenant is its own graph (`t_registry`, `t_acme`, `t_sbx_<id>`).

## Local setup

Requirements: Node 22+, pnpm, and FalkorDB.

```bash
# 1. FalkorDB (Browser on http://localhost:3000)
docker compose up -d falkordb
#    No Docker? Load the FalkorDB module into redis-server 7.4+/8:
#    redis-server --loadmodule /path/to/falkordb-x64.so   (from github.com/FalkorDB/FalkorDB/releases)

# 2. Install
pnpm install
cp .env.example .env   # optional; defaults to redis://localhost:6379

# 3. Schema + seed
pnpm migrate
pnpm seed

# 4. Ask
pnpm ask "Why did we choose Backblaze over Neon storage?"

# 5. Tests (needs FalkorDB running)
pnpm test

# 6. Web app on http://localhost:8080
pnpm dev
```
