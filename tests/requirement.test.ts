import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TenantGraph, ask, disconnect, ingestDocument, listTasks, getTask, listProposals, runRequirement } from "@crewbrain/graph";
import { ACME, REGISTRY, seedAcme } from "./helpers";

let acme: TenantGraph;

beforeAll(async () => {
  await seedAcme();
  acme = await TenantGraph.open(ACME);
});

afterAll(async () => {
  for (const k of [ACME, REGISTRY]) await (await TenantGraph.open(k)).drop();
  await disconnect();
});

describe("requirement pipeline", () => {
  it("answers a recorded decision question", async () => {
    const before = (await listTasks(acme)).length;
    const res = await runRequirement(acme, { text: "Why did we choose Amazon S3 over MySQL for media storage?", actor: "ashish" });
    expect(res.outcome).toBe("answered");
    expect(res.ask?.decision?.id).toBe("D-07");
    expect(res.ask?.citations?.length).toBeGreaterThan(0);
    const after = (await listTasks(acme)).length;
    expect(after).toBe(before);
  });

  it("creates and claims a task for an action requirement", async () => {
    const doc = await ingestDocument(acme, { text: "Unrelated memory note about quarterly planning.", title: "note.md", kind: "doc", author: "ashish" });
    const proposalId = doc.proposalId!;
    const reqText = "Execute the flibberwock migration to production immediately";
    const res = await runRequirement(acme, { text: reqText, actor: "ashish" });
    expect(res.outcome).toBe("task_claimed");
    expect(res.task?.status).toBe("claimed");
    const keys = res.stages.map((s) => s.key);
    expect(keys).toContain("received");
    expect(keys).toContain("ask");
    expect(keys).toContain("task");
    expect(keys).toContain("claim");
    const task = await getTask(acme, res.task!.id);
    expect(task?.status).toBe("claimed");

    // proposal still pending
    const proposals = await listProposals(acme, { status: "pending" });
    expect(proposals.find((p) => p.id === proposalId)?.status).toBe("pending");
    expect(res.pendingProposals.map((p) => p.id)).toContain(proposalId);
  });
});
