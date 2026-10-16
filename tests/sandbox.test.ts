import { afterAll, describe, expect, it } from "vitest";
import {
  SandboxCapError, TenantGraph, ask, cleanupExpiredSandboxes, createSandbox, disconnect, graphMemory, listSandboxes, parseMemoryReply,
} from "@crewbrain/graph";
import { seedTenant } from "@crewbrain/graph";
import { acmeCorpus, acmeSeed } from "../seed/index";

// Own keys so this file never races trace/memory tests over t_test_acme.
const ACME = "t_test_sbx_acme";
const seedAcme = () => seedTenant(acmeSeed(), acmeCorpus(), { reset: true, graphKey: ACME, registryKey: "t_test_sbx_registry" });

const REG = "t_test_sbx_registry";
const made: string[] = [];

afterAll(async () => {
  for (const k of [...made, ACME, REG]) await (await TenantGraph.open(k)).drop();
  await disconnect();
});

describe("sandboxes", () => {
  it("creates t_sbx_<8 chars> with a tiny seed and a 24h registry entry", async () => {
    const now = Date.now();
    const s = await createSandbox({ registryKey: REG, now });
    made.push(s.graph);
    expect(s.graph).toMatch(/^t_sbx_[a-z0-9]{8}$/);
    expect(s.expires_at - s.created_at).toBe(24 * 60 * 60 * 1000);
    const m = await graphMemory(s.graph);
    expect(m.nodes).toBeGreaterThan(0);
    expect(m.nodes).toBeLessThan(20);
    expect((await listSandboxes({ registryKey: REG })).map((x) => x.graph)).toContain(s.graph);
  });

  it("isolation: an Acme question abstains in a fresh sandbox but answers in Acme", async () => {
    await seedAcme();
    const q = "Why did we choose Backblaze over Neon storage?";
    const inAcme = await ask(await TenantGraph.open(ACME), q, { store: false });
    expect(inAcme.abstained).toBe(false);
    const s = await createSandbox({ registryKey: REG });
    made.push(s.graph);
    const sbx = await TenantGraph.open(s.graph);
    const r = await ask(sbx, q, { store: false });
    expect(r.abstained).toBe(true);
    const leaked = await sbx.ro<{ n: number }>("MATCH (n) WHERE n.name IN ['Backblaze B2', 'Neon'] OR n.id IN ['backblaze-b2', 'neon', 'D-07'] RETURN count(n) AS n");
    expect(leaked[0].n).toBe(0);
  });

  it("cleanup drops expired sandboxes and their registry rows", async () => {
    const past = Date.now() - 25 * 60 * 60 * 1000;
    const old = await createSandbox({ registryKey: REG, now: past });
    made.push(old.graph);
    const dropped = await cleanupExpiredSandboxes({ registryKey: REG });
    expect(dropped).toContain(old.graph);
    expect(await (await TenantGraph.open(old.graph)).exists()).toBe(false);
    expect((await listSandboxes({ registryKey: REG })).map((x) => x.graph)).not.toContain(old.graph);
  });

  it("enforces the cap", async () => {
    const active = (await listSandboxes({ registryKey: REG })).length;
    await expect(createSandbox({ registryKey: REG, cap: active })).rejects.toBeInstanceOf(SandboxCapError);
  });
});

describe("memory meter", () => {
  it("reads GRAPH.MEMORY USAGE for a graph", async () => {
    const m = await graphMemory(ACME);
    expect(m.total_mb).toBeGreaterThanOrEqual(0);
    expect(m.detail).toHaveProperty("total_graph_sz_mb");
    expect(m.nodes).toBeGreaterThan(40);
  });
  it("parses nested replies", () => {
    expect(parseMemoryReply(["a", 1, "b", ["X", 2]])).toEqual({ a: 1, b: { X: 2 } });
  });
});
