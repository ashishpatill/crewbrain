import { afterAll, describe, expect, it } from "vitest";
import { TenantGraph, createSandbox, disconnect, resolveTenantKey } from "@crewbrain/graph";

const REG = "t_test_allow_registry";
const made: string[] = [];

afterAll(async () => {
  for (const k of [...made, REG]) await (await TenantGraph.open(k)).drop();
  await disconnect();
});

describe("tenant allowlist", () => {
  it("accepts acme (and the default)", async () => {
    expect(await resolveTenantKey("acme", { registryKey: REG })).toBe("t_acme");
    expect(await resolveTenantKey(null, { registryKey: REG })).toBe("t_acme");
    expect(await resolveTenantKey("ACME", { registryKey: REG })).toBe("t_acme");
  });

  it("refuses registry, test graphs, made-up names and unregistered sandbox ids", async () => {
    for (const t of ["registry", "t_registry", "test_acme", "globex", "sbx_zzzzzzzz", "sbx_bad", "acme;drop"]) {
      await expect(resolveTenantKey(t, { registryKey: REG })).rejects.toThrow(/unknown tenant/);
    }
  });

  it("accepts a registered sandbox until it expires", async () => {
    const now = Date.now();
    const s = await createSandbox({ registryKey: REG, now });
    made.push(s.graph);
    expect(await resolveTenantKey(s.id, { registryKey: REG, now })).toBe(s.graph);
    await expect(resolveTenantKey(s.id, { registryKey: REG, now: s.expires_at + 1 })).rejects.toThrow(/unknown tenant/);
  });
});
