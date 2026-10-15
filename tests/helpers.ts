import { TenantGraph, seedTenant, type SeedSource, type TenantSeed } from "@crewbrain/graph";
import { acmeCorpus, acmeSeed } from "../seed/index";

// Throwaway graph keys so tests never touch the real t_acme / t_registry.
export const ACME = "t_test_acme";
export const REGISTRY = "t_test_registry";
export const SANDBOX = "t_sbx_test0001";

export async function seedAcme() {
  return seedTenant(acmeSeed(), acmeCorpus(), { reset: true, graphKey: ACME, registryKey: REGISTRY });
}

/** Tiny sandbox template: a different company with one unrelated decision. */
export async function seedSandbox() {
  const seed: TenantSeed = {
    tenant: { id: "sbx_test0001", name: "Sandbox", kind: "sandbox", graph: SANDBOX },
    people: [{ id: "lin", name: "Lin", role: "Founder", handle: "@lin" }],
    teams: [],
    projects: [],
    agents: [],
    entities: [
      { id: "sqlite", name: "SQLite", kind: "tech", aliases: ["sqlite"] },
      { id: "redis-cache", name: "Redis", kind: "tech", aliases: ["redis"] },
    ],
    decisions: [
      {
        id: "D-01", title: "Local data in SQLite", statement: "The desktop app stores local data in SQLite.",
        decided_at: "2026-10-01T10:00:00+05:30", about: ["sqlite"], chose: ["sqlite"],
        rejected: [{ entity: "redis-cache", reason: "needs a server" }], decided_by: "lin", approved_by: null,
        recorded_in: ["S-01"],
        reasons: [{ id: "R-01-1", kind: "other", text: "No server to run", passages: ["P-01-0"] }],
      },
    ],
  };
  const corpus: SeedSource[] = [
    {
      id: "S-01", kind: "chat", title: "storage", author: "lin", created_at: Date.parse("2026-10-01T10:00:00+05:30"), hash: "x",
      passages: [{ id: "P-01-0", idx: 0, text: "Lin: SQLite over Redis, because there is no server to run." }],
    },
  ];
  return seedTenant(seed, corpus, { reset: true, graphKey: SANDBOX, registryKey: REGISTRY });
}

export async function counts(key: string) {
  const g = await TenantGraph.open(key);
  const [n] = await g.ro<{ n: number }>("MATCH (n) RETURN count(n) AS n");
  const [e] = await g.ro<{ e: number }>("MATCH ()-[r]->() RETURN count(r) AS e");
  return { nodes: n.n, edges: e.e };
}
