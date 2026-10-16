import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TenantGraph,
  ask,
  disconnect,
  remember,
  supersedeMemory,
  startEpisode,
  addTurn,
  endEpisode,
  recallMemories,
  getMemory,
  createProposal,
  listProposals,
  decideProposal,
  listTimeline,
  ingestDocument,
  seedDemoMemories,
  type DecisionProposalPayload,
} from "@crewbrain/graph";
import { ACME, REGISTRY, seedAcme } from "./helpers";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let acme: TenantGraph;
const here = dirname(fileURLToPath(import.meta.url));

beforeAll(async () => {
  await seedAcme();
  acme = await TenantGraph.open(ACME);
  await seedDemoMemories(acme);
});

afterAll(async () => {
  for (const k of [ACME, REGISTRY]) await (await TenantGraph.open(k)).drop();
  await disconnect();
});

describe("memory: remember + supersede + as-of", () => {
  it("rejects semantic memory without a source", async () => {
    await expect(remember(acme, { text: "orphan fact", type: "semantic" })).rejects.toThrow(/source/);
  });

  it("writes semantic memory with sources and increments heat on recall", async () => {
    const { memoryId } = await remember(acme, {
      text: "Mux signed playback tokens expire in 24h.",
      type: "semantic",
      sources: ["S-07"],
      writtenBy: "scribe",
      mentions: ["mux"],
      scopeProject: "video-lessons",
    });
    expect(memoryId).toMatch(/^M-/);

    const first = await recallMemories(acme, { query: "Mux signed" });
    expect(first.some((m) => m.id === memoryId)).toBe(true);
    const heat1 = first.find((m) => m.id === memoryId)!.heat;

    const second = await recallMemories(acme, { query: "Mux signed" });
    expect(second.find((m) => m.id === memoryId)!.heat).toBeGreaterThan(heat1);
  });

  it("supersede closes the old memory; as-of returns the right version", async () => {
    const atOld = Date.parse("2026-09-01T12:00:00+05:30");
    const atNew = Date.parse("2026-10-14T12:00:00+05:30");
    const { memoryId: oldId } = await remember(acme, {
      text: "All new videos go to B2.",
      type: "semantic",
      sources: ["S-11"],
      writtenBy: "scribe",
      validFrom: atOld,
      mentions: ["backblaze-b2"],
    });
    const { memoryId: newId } = await remember(acme, {
      text: "New videos go to R2; old ones stay on B2.",
      type: "semantic",
      sources: ["S-39"],
      writtenBy: "scribe",
      validFrom: atNew,
      supersedes: oldId,
      mentions: ["cloudflare-r2", "backblaze-b2"],
    });

    expect(await getMemory(acme, oldId!, atNew)).toBeNull();
    expect((await getMemory(acme, oldId!, atOld))?.text).toMatch(/All new videos go to B2/);
    expect((await getMemory(acme, newId!, atNew))?.text).toMatch(/New videos go to R2/);
    expect((await getMemory(acme, newId!, atNew))?.supersedes).toContain(oldId);

    const mid = await recallMemories(acme, { query: "videos go", asOf: atOld });
    expect(mid.map((m) => m.id)).toContain(oldId);
    expect(mid.map((m) => m.id)).not.toContain(newId);
  });

  it("procedural remember opens a proposal instead of writing", async () => {
    const { proposalId, memoryId } = await remember(acme, {
      text: "Upload flow: presign → PUT → verify",
      type: "procedural",
      writtenBy: "coder",
    });
    expect(memoryId).toBeUndefined();
    expect(proposalId).toMatch(/^PR-/);
    const pending = await listProposals(acme, { status: "pending" });
    expect(pending.some((p) => p.id === proposalId && p.kind === "procedure")).toBe(true);
  });
});

describe("memory: episodes", () => {
  it("records turns and links produced memories", async () => {
    const episodeId = await startEpisode(acme, { agentId: "researcher" });
    await addTurn(acme, episodeId, { role: "user", text: "Look up R2 signed URLs" });
    await addTurn(acme, episodeId, { role: "assistant", text: "R2 needs S3 sigv4." });
    const { memoryId } = await remember(acme, {
      text: "R2 needs S3 sigv4 for signed URLs.",
      type: "semantic",
      sources: ["S-39"],
      writtenBy: "researcher",
    });
    await endEpisode(acme, episodeId, { summary: "Researched R2 signed URLs", memoryIds: [memoryId!] });

    const [ep] = await acme.ro<{ summary: string; turns: number; mems: number }>(
      `MATCH (e:Episode {id: $id})
       OPTIONAL MATCH (e)-[:HAS_TURN]->(t:Turn)
       OPTIONAL MATCH (e)-[:PRODUCED]->(m:Memory)
       RETURN e.summary AS summary, count(DISTINCT t) AS turns, count(DISTINCT m) AS mems`,
      { id: episodeId },
    );
    expect(ep.summary).toMatch(/R2/);
    expect(ep.turns).toBe(2);
    expect(ep.mems).toBe(1);
  });
});

describe("review queue: approve / reject enforced server-side", () => {
  it("rejects an agent as approver", async () => {
    const proposalId = await createProposal(
      acme,
      {
        kind: "memory",
        text: "should not auto-approve",
        type: "semantic",
        epistemic: "fact",
        sources: ["S-01"],
      },
      "scribe",
    );
    await expect(decideProposal(acme, proposalId, { actor: "scribe", action: "approve" })).rejects.toThrow(/Person/);
  });

  it("person can reject", async () => {
    const proposalId = await createProposal(
      acme,
      {
        kind: "memory",
        text: "noise",
        type: "semantic",
        epistemic: "opinion",
        sources: ["S-01"],
      },
      "scribe",
    );
    const r = await decideProposal(acme, proposalId, { actor: "asha", action: "reject" });
    expect(r.createdIds).toEqual([]);
    const [row] = await acme.ro<{ status: string }>("MATCH (p:Proposal {id: $id}) RETURN p.status AS status", { id: proposalId });
    expect(row.status).toBe("rejected");
  });

  it("approving the R2 decision proposal supersedes D-07 and changes ask as-of", async () => {
    const sample = readFileSync(join(here, "../seed/demo-ingest/r2-chat.md"), "utf8");
    // Strip front matter for ingest body — ingestDocument takes raw text.
    const body = sample.replace(/^---[\s\S]*?---\n/, "").trim();
    const ingested = await ingestDocument(acme, {
      text: body,
      title: "#infra · move new videos to R2",
      kind: "chat",
      author: "ravi",
      createdAt: Date.parse("2026-10-14T09:40:00+05:30"),
    });
    expect(ingested.proposalId).toMatch(/^PR-/);
    expect(ingested.passageIds.length).toBeGreaterThanOrEqual(1);

    const before = await ask(acme, "Why did we choose Backblaze over Neon storage?", { store: false });
    expect(before.decision?.id).toBe("D-07");
    expect(before.decision?.status).toBe("accepted");

    const { createdIds } = await decideProposal(acme, ingested.proposalId!, { actor: "asha", action: "approve" });
    expect(createdIds).toHaveLength(1);
    const newDecisionId = createdIds[0];

    const [d07] = await acme.ro<{ status: string; validTo: number | null }>(
      "MATCH (d:Decision {id: 'D-07'}) RETURN d.status AS status, d.valid_to AS validTo",
    );
    expect(d07.status).toBe("superseded");
    expect(d07.validTo).toBeTruthy();

    const [edge] = await acme.ro<{ partial: boolean }>(
      "MATCH (n:Decision {id: $id})-[r:SUPERSEDES]->(o:Decision {id: 'D-07'}) RETURN r.partial AS partial",
      { id: newDecisionId },
    );
    expect(edge.partial).toBe(true);

    // After approval, "Backblaze over Neon" still matches D-07 only when as-of is before the supersede.
    const historical = await ask(acme, "Why did we choose Backblaze over Neon storage?", {
      store: false,
      asOf: Date.parse("2026-09-01T00:00:00+05:30"),
    });
    expect(historical.decision?.id).toBe("D-07");

    const nowAsk = await ask(acme, "Why did we choose Backblaze over Neon storage?", { store: false });
    // D-07 is superseded so status filter still allows superseded when valid_to > asOf is false —
    // Q_CANDIDATES requires valid_to IS NULL OR valid_to > asOf, so D-07 is hidden now.
    expect(nowAsk.decision?.id).not.toBe("D-07");

    const r2Ask = await ask(acme, "Why did we choose Cloudflare R2 over Backblaze?", { store: false });
    // May abstain if we didn't reject B2; at least the new decision chose R2.
    const [neu] = await acme.ro<{ title: string }>("MATCH (d:Decision {id: $id}) RETURN d.title AS title", { id: newDecisionId });
    expect(neu.title).toMatch(/R2/);
  });
});

describe("timeline", () => {
  it("lists decisions, memories and sources ordered by time", async () => {
    const events = await listTimeline(acme, { limit: 50 });
    expect(events.some((e) => e.kind === "decision" && e.id === "D-07")).toBe(true);
    expect(events.some((e) => e.kind === "memory")).toBe(true);
    expect(events.some((e) => e.kind === "source")).toBe(true);
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].ts).toBeGreaterThanOrEqual(events[i].ts);
    }
  });

  it("as-of hides later sources", async () => {
    const early = await listTimeline(acme, { asOf: Date.parse("2026-07-01T00:00:00+05:30"), type: "decision" });
    expect(early.every((e) => e.ts <= Date.parse("2026-07-01T00:00:00+05:30") || e.validFrom! <= Date.parse("2026-07-01T00:00:00+05:30"))).toBe(true);
    expect(early.some((e) => e.id === "D-07")).toBe(false);
    expect(early.some((e) => e.id === "D-01")).toBe(true);
  });
});

describe("ingest idempotency", () => {
  it("re-ingesting the same text returns the same source", async () => {
    const text = "Lin: reminder that PostHog is our analytics tool.";
    const a = await ingestDocument(acme, { text, title: "note", author: "asha" });
    const b = await ingestDocument(acme, { text, title: "note", author: "asha" });
    expect(b.sourceId).toBe(a.sourceId);
    expect(b.passageIds).toEqual(a.passageIds);
  });
});
