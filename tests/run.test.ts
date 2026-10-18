import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TenantGraph,
  createRun,
  ingestIntoRun,
  decideInRun,
  getRun,
  getLatestRun,
  computeNextAction,
  disconnect,
  listTasks,
  seedTenant,
} from "@crewbrain/graph";
import { acmeCorpus, acmeSeed } from "../seed/index";

const ACME = "t_test_run_acme";
const REGISTRY = "t_test_run_registry";
const seedAcme = () => seedTenant(acmeSeed(), acmeCorpus(), { reset: true, graphKey: ACME, registryKey: REGISTRY });

let acme: TenantGraph;

const SIGNED_DOC = "Signed URLs for lookbook video: we will deliver lookbook video through CloudFront signed URLs that expire after 1 hour. The originals stay in Amazon S3. Only delivery changes; public link hotlinking drives bandwidth bills.";

beforeAll(async () => {
  await seedAcme();
  acme = await TenantGraph.open(ACME);
});

afterAll(async () => {
  for (const k of [ACME, REGISTRY]) await (await TenantGraph.open(k)).drop();
  await disconnect();
});

describe("run orchestration", () => {
  it("(a) answered branch: S3 question, no task, nothing needed", async () => {
    const before = (await listTasks(acme)).length;
    const run = await createRun(acme, { text: "Why did we choose Amazon S3 over MySQL for media storage?", actor: "ashish" });
    expect(run.outcome).toBe("answered");
    expect(run.taskId).toBeNull();
    const after = (await listTasks(acme)).length;
    expect(after).toBe(before);
    expect(run.nextAction.label).toBe("Nothing needed — answered");
  });

  it("(b) task branch: unanswered action requirement, task claimed, execution stopped", async () => {
    const run = await createRun(acme, { text: "Execute the flibberwock migration to production immediately", actor: "ashish" });
    expect(run.outcome).toBe("task_claimed");
    expect(run.task?.status).toBe("claimed");
    const execStage = run.stages.find((s) => s.key === "execution");
    expect(execStage?.state).toBe("stopped");
  });

  it("(c) full loop: ingest -> proposal -> approve (Person) -> re-answered; agent cannot approve", async () => {
    const run = await createRun(acme, { text: "Why did we choose signed URLs for lookbook video?", actor: "ashish" });
    const run2 = await ingestIntoRun(acme, run.id, { text: SIGNED_DOC, title: "r2 chat", kind: "chat", author: "ashish" });
    const pending = run2.proposals.filter((p) => p.status === "pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(run2.nextAction.label).toContain(pending[0].id);

    const approved = await decideInRun(acme, run.id, { proposalId: pending[0].id, actor: "nia", action: "approve" });
    expect(approved.outcome).toBe("answered_after_approval");
    expect(approved.stages.some((s) => s.key === "reask")).toBe(true);
    expect(approved.reaskCitations.length).toBeGreaterThan(0);

    // agent cannot approve
    const runB = await createRun(acme, { text: "Why did we choose signed URLs for lookbook video?", actor: "ashish" });
    const runB2 = await ingestIntoRun(acme, runB.id, { text: SIGNED_DOC + " Unique second copy for agent-check.", title: "r2 chat copy", kind: "chat", author: "ashish" });
    const pendingB = runB2.proposals.filter((p) => p.status === "pending")[0];
    expect(pendingB).toBeTruthy();
    await expect(decideInRun(acme, runB.id, { proposalId: pendingB!.id, actor: "scribe", action: "approve" })).rejects.toThrow(/only a Person|agents cannot/i);
  });

  it("(d) computeNextAction unit cases", () => {
    expect(computeNextAction({ outcome: "answered", proposals: [] }).label).toBe("Nothing needed — answered");
    expect(computeNextAction({ outcome: "task_claimed", proposals: [{ id: "PR-123", status: "pending" }] }).label).toBe("Next: approve or reject proposal PR-123");
    expect(computeNextAction({ outcome: "task_created", proposals: [] }).label).toBe("Next: claim the task on Agents");
    expect(computeNextAction({ outcome: "task_claimed", sourceIds: [], proposals: [] }).label).toBe("Next: add a source document");
    expect(computeNextAction({ outcome: "approved_not_answered", proposals: [] }).label).toBe("Next: add a source document that answers this");
    expect(computeNextAction({ outcome: "rejected", proposals: [] }).label).toBe("Next: add a different source document");
  });

  it("getLatestRun returns a run", async () => {
    const r = await getLatestRun(acme);
    expect(r).not.toBeNull();
  });
});