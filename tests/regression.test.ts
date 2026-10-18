import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TenantGraph,
  createSandbox,
  decideProposal,
  disconnect,
  ingestDocument,
  listProposals,
  recallMemories,
  resolveTenantKey,
} from "@crewbrain/graph";
import { ACME, REGISTRY, seedAcme } from "./helpers";

const madeSandboxes: string[] = [];

beforeAll(async () => {
  await seedAcme();
});

afterAll(async () => {
  for (const k of [...madeSandboxes, ACME, REGISTRY]) await (await TenantGraph.open(k)).drop();
  await disconnect();
});

describe("regression: ingest + review + memory", () => {
  let acme: TenantGraph;

  beforeAll(async () => {
    acme = await TenantGraph.open(ACME);
  });

  it("generic doc returns a non-null memory proposal", async () => {
    const text = "Regression note: the widget cache invalidates every 5 minutes.";
    const ingested = await ingestDocument(acme, { text, title: "Regression note", kind: "chat", author: "nia" });
    expect(ingested.proposalId).not.toBeNull();
    expect(ingested.proposalId).toMatch(/^PR-/);

    const pending = await listProposals(acme, { status: "pending" });
    expect(pending.some((p) => p.id === ingested.proposalId && p.kind === "memory")).toBe(true);

    const { createdIds } = await decideProposal(acme, ingested.proposalId!, { actor: "nia", action: "approve" });
    expect(createdIds.length).toBeGreaterThanOrEqual(1);

    const mems = await recallMemories(acme, { query: "widget cache invalidates" });
    expect(mems.some((m) => m.text.includes("widget cache invalidates") || m.text.includes("Regression note"))).toBe(true);
  });

  it("approve as non-person 'asha' throws", async () => {
    const ingested = await ingestDocument(acme, { text: "Another regression note: asha cannot approve.", title: "note2", author: "nia" });
    expect(ingested.proposalId).not.toBeNull();
    await expect(decideProposal(acme, ingested.proposalId!, { actor: "asha", action: "approve" })).rejects.toThrow();
  });
});

describe("regression: sandbox ingest", () => {
  it("ingests into a created sandbox tenant", async () => {
    const s = await createSandbox({ registryKey: REGISTRY });
    madeSandboxes.push(s.graph);
    const g = await TenantGraph.open(s.graph);
    const ingested = await ingestDocument(g, { text: "Sandbox note about markdown.", title: "Sandbox note", kind: "chat", author: "you" });
    expect(ingested.proposalId).not.toBeNull();
    expect(await resolveTenantKey(s.id, { registryKey: REGISTRY })).toBe(s.graph);
  });
});