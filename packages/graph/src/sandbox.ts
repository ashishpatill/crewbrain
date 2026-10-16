import { randomInt } from "node:crypto";
import { TenantGraph } from "./tenant";
import { migrate } from "./migrate";
import { seedTenant, type SeedSource, type TenantSeed } from "./seed";

export const SANDBOX_TTL_MS = 24 * 60 * 60 * 1000;
export const SANDBOX_CAP = 20;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export interface SandboxRecord {
  id: string;
  graph: string;
  created_at: number;
  expires_at: number;
}

export interface SandboxOptions {
  registryKey?: string;
  now?: number;
  ttlMs?: number;
  cap?: number;
}

export class SandboxCapError extends Error {
  constructor(readonly cap: number) {
    super(`sandbox cap reached (${cap} active); try again after one expires`);
  }
}

/** 8 random lowercase letters/digits from a crypto source. */
export function sandboxSuffix(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Tiny starter graph: one fictional person, two entities, one decision. Nothing about Acme. */
export function sandboxSeed(id: string, graph: string): { seed: TenantSeed; corpus: SeedSource[] } {
  const at = "2026-10-01T09:00:00+05:30";
  return {
    seed: {
      tenant: { id, name: "Your sandbox", kind: "sandbox", graph },
      people: [{ id: "you", name: "You", role: "Founder", handle: "@you" }],
      teams: [],
      projects: [],
      agents: [],
      entities: [
        { id: "markdown-notes", name: "Markdown notes", kind: "tech", aliases: ["markdown", "markdown notes"] },
        { id: "spreadsheet", name: "Spreadsheet", kind: "tech", aliases: ["spreadsheet"] },
      ],
      decisions: [
        {
          id: "D-01", title: "Keep notes in Markdown", statement: "Team notes live in Markdown files.",
          decided_at: at, about: ["markdown-notes"], chose: ["markdown-notes"],
          rejected: [{ entity: "spreadsheet", reason: "hard to diff" }], decided_by: "you", approved_by: null,
          recorded_in: ["S-01"],
          reasons: [{ id: "R-01-1", kind: "other", text: "Plain text is easy to diff and review", passages: ["P-01-0"] }],
        },
      ],
    },
    corpus: [
      {
        id: "S-01", kind: "chat", title: "notes format", author: "you", created_at: Date.parse(at), hash: "sbx-s01",
        passages: [{ id: "P-01-0", idx: 0, text: "You: Markdown over a spreadsheet, because plain text is easy to diff and review." }],
      },
    ],
  };
}

async function registry(key: string): Promise<TenantGraph> {
  const reg = await TenantGraph.open(key);
  await migrate(reg);
  return reg;
}

export async function listSandboxes(opts: SandboxOptions = {}): Promise<SandboxRecord[]> {
  const reg = await registry(opts.registryKey ?? "t_registry");
  return reg.ro<SandboxRecord>(
    "MATCH (t:Tenant {kind: 'sandbox'}) WHERE t.expires_at IS NOT NULL RETURN t.id AS id, t.graph AS graph, t.created_at AS created_at, t.expires_at AS expires_at ORDER BY t.created_at",
  );
}

/** Drops every expired sandbox graph and removes its registry entry. Returns the dropped graph keys. */
export async function cleanupExpiredSandboxes(opts: SandboxOptions = {}): Promise<string[]> {
  const now = opts.now ?? Date.now();
  const reg = await registry(opts.registryKey ?? "t_registry");
  const expired = await reg.ro<{ id: string; graph: string }>(
    "MATCH (t:Tenant {kind: 'sandbox'}) WHERE t.expires_at <= $now RETURN t.id AS id, t.graph AS graph",
    { now },
  );
  const dropped: string[] = [];
  for (const e of expired) {
    if (!/^t_sbx_[a-z0-9]{8}$/.test(e.graph)) continue; // never drop a non-sandbox graph
    await (await TenantGraph.open(e.graph)).drop();
    await reg.query("MATCH (t:Tenant {id: $id, kind: 'sandbox'}) DELETE t", { id: e.id });
    dropped.push(e.graph);
  }
  return dropped;
}

/** Cleans up expired sandboxes, enforces the cap, then creates and seeds a fresh t_sbx_<8> graph. */
export async function createSandbox(opts: SandboxOptions = {}): Promise<SandboxRecord> {
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlMs ?? SANDBOX_TTL_MS;
  const cap = opts.cap ?? SANDBOX_CAP;
  const registryKey = opts.registryKey ?? "t_registry";
  await cleanupExpiredSandboxes({ registryKey, now });
  const active = await listSandboxes({ registryKey });
  if (active.length >= cap) throw new SandboxCapError(cap);

  let suffix = sandboxSuffix();
  for (let tries = 0; await (await TenantGraph.open(`t_sbx_${suffix}`)).exists(); tries++) {
    if (tries > 5) throw new Error("could not pick a free sandbox key");
    suffix = sandboxSuffix();
  }
  const id = `sbx_${suffix}`;
  const graph = `t_${id}`;
  const { seed, corpus } = sandboxSeed(id, graph);
  await seedTenant(seed, corpus, { reset: true, graphKey: graph, registryKey });
  const reg = await registry(registryKey);
  await reg.query("MATCH (t:Tenant {id: $id}) SET t.created_at = $now, t.expires_at = $exp", { id, now, exp: now + ttl });
  return { id, graph, created_at: now, expires_at: now + ttl };
}

/** Memory meter: GRAPH.MEMORY USAGE total for a graph, in MB, plus node/edge counts. */
export async function graphMemory(key: string): Promise<{ graph: string; total_mb: number; nodes: number; edges: number; detail: Record<string, unknown> }> {
  const g = await TenantGraph.open(key);
  if (!(await g.exists())) return { graph: key, total_mb: 0, nodes: 0, edges: 0, detail: {} };
  const detail = await g.memoryUsage();
  const [n] = await g.ro<{ n: number }>("MATCH (n) RETURN count(n) AS n");
  const [e] = await g.ro<{ e: number }>("MATCH ()-[r]->() RETURN count(r) AS e");
  return { graph: key, total_mb: Number(detail.total_graph_sz_mb ?? 0), nodes: n.n, edges: e.e, detail };
}

export class UnknownTenantError extends Error {
  constructor(tenant: string) {
    super(`unknown tenant: ${tenant}`);
  }
}

/**
 * Public tenant allowlist: only "acme" or a sandbox id that is registered and not expired.
 * Returns the graph key. Anything else (registry, test graphs, made-up names) is refused.
 */
export async function resolveTenantKey(tenant?: string | null, opts: SandboxOptions = {}): Promise<string> {
  const id = (tenant || "acme").toLowerCase().replace(/^t_/, "");
  if (id === "acme") return "t_acme";
  if (!/^sbx_[a-z0-9]{8}$/.test(id)) throw new UnknownTenantError(String(tenant));
  const now = opts.now ?? Date.now();
  const reg = await registry(opts.registryKey ?? "t_registry");
  const [hit] = await reg.ro<{ graph: string }>(
    "MATCH (t:Tenant {id: $id, kind: 'sandbox'}) WHERE t.expires_at > $now RETURN t.graph AS graph",
    { id, now },
  );
  if (!hit || hit.graph !== `t_${id}`) throw new UnknownTenantError(String(tenant));
  return hit.graph;
}
