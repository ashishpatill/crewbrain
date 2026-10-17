import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TenantGraph, disconnect, createTask, claimTask, claimNext, startTask, completeTask, handoff, acceptHandoff,
  listHandoffs, contextCard, runSignedUrlScenario, raceTest, getTask, remember, ClaimConflictError,
} from "@crewbrain/graph";
import { ACME, REGISTRY, SANDBOX, seedAcme, seedSandbox } from "./helpers";

let acme: TenantGraph;

beforeAll(async () => {
  await seedAcme();
  acme = await TenantGraph.open(ACME);
});

afterAll(async () => {
  for (const k of [ACME, REGISTRY, SANDBOX]) await (await TenantGraph.open(k)).drop();
  await disconnect();
});

describe("tasks: atomic versioned claim", () => {
  it("first claim wins, a stale-version claim is refused", async () => {
    const t = await createTask(acme, { title: "claim me", project: "orders" });
    expect(t.status).toBe("todo");
    const won = await claimTask(acme, t.id, "coder", t.version);
    expect(won.claimedBy).toBe("coder");
    expect(won.version).toBe(t.version + 1);
    await expect(claimTask(acme, t.id, "reviewer", t.version)).rejects.toBeInstanceOf(ClaimConflictError);
    expect((await getTask(acme, t.id))!.claimedBy).toBe("coder");
  });

  it("two agents claiming the same task at the same moment: exactly one wins", async () => {
    const t = await createTask(acme, { title: "contested" });
    const results = await Promise.allSettled(["coder", "reviewer", "researcher", "scribe"].map((a) => claimTask(acme, t.id, a, t.version)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("only the holder can start or complete a task", async () => {
    const t = await createTask(acme, { title: "holder only" });
    await claimTask(acme, t.id, "coder", t.version);
    await expect(startTask(acme, t.id, "reviewer")).rejects.toThrow(/not held/);
    expect((await startTask(acme, t.id, "coder")).status).toBe("in_progress");
    expect((await completeTask(acme, t.id, "coder")).status).toBe("done");
  });

  it("claimNext returns null when nothing is left", async () => {
    await acme.query("MATCH (t:Task {status: 'todo'}) SET t.status = 'blocked'");
    expect(await claimNext(acme, "coder")).toBeNull();
  });
});

describe("handoffs carry evidence", () => {
  it("rejects a handoff with no evidence or unknown evidence", async () => {
    const t = await createTask(acme, { title: "needs evidence" });
    await claimTask(acme, t.id, "researcher", t.version);
    await expect(handoff(acme, { taskId: t.id, from: "researcher", to: "coder", note: "x", carries: [] })).rejects.toThrow(/evidence/);
    await expect(handoff(acme, { taskId: t.id, from: "researcher", to: "coder", note: "x", carries: ["M-nope"] })).rejects.toThrow(/unknown evidence/);
    expect((await getTask(acme, t.id))!.status).toBe("claimed");
  });

  it("a non-holder cannot hand off, and only the addressee can accept", async () => {
    const t = await createTask(acme, { title: "handoff rules" });
    await claimTask(acme, t.id, "researcher", t.version);
    const { memoryId } = await remember(acme, { text: "evidence", type: "episodic", writtenBy: "researcher" });
    await expect(handoff(acme, { taskId: t.id, from: "coder", to: "reviewer", note: "x", carries: [memoryId!] })).rejects.toThrow(/not held/);
    const h = await handoff(acme, { taskId: t.id, from: "researcher", to: "coder", note: "over to you", carries: [memoryId!] });
    expect(h.carries.map((c) => c.id)).toEqual([memoryId]);
    expect((await getTask(acme, t.id))!.status).toBe("handed_off");
    await expect(acceptHandoff(acme, h.id, "reviewer")).rejects.toThrow(/addressed to coder/);
    // a third agent cannot grab a task handed to someone else
    const cur = (await getTask(acme, t.id))!;
    await expect(claimTask(acme, t.id, "reviewer", cur.version)).rejects.toBeInstanceOf(ClaimConflictError);
    expect((await acceptHandoff(acme, h.id, "coder")).claimedBy).toBe("coder");
  });
});

describe("shared memory across agents (scenario)", () => {
  it("coder's fresh context card shows what researcher wrote and handed over", async () => {
    const t = await createTask(acme, { title: "card check", project: "storefront" });
    await claimTask(acme, t.id, "researcher", t.version);
    const { memoryId } = await remember(acme, {
      text: "Presigned links should expire within 1 hour.", type: "semantic", sources: ["S-39"],
      writtenBy: "researcher", scopeProject: "storefront",
    });
    const h = await handoff(acme, { taskId: t.id, from: "researcher", to: "coder", note: "see memory", carries: [memoryId!] });
    const card = await contextCard(acme, "coder");
    expect(card.inbox.map((x) => x.id)).toContain(h.id);
    expect(card.memories.find((m) => m.id === memoryId)?.writtenBy).toBe("researcher");
    expect(card.openTasks.map((x) => x.id)).toContain(t.id);
  });

  it("runs researcher -> coder -> reviewer -> coder end to end, recorded in the graph", async () => {
    const { taskId, steps } = await runSignedUrlScenario(acme);
    expect(steps.filter((s) => s.action === "handoff").map((s) => `${s.agent}${s.detail}`)).toEqual([
      "researcher-> coder", "coder-> reviewer", "reviewer-> coder (changes requested)",
    ]);
    expect((await getTask(acme, taskId))!.status).toBe("done");
    const hs = await listHandoffs(acme, { task: taskId });
    expect(hs).toHaveLength(3);
    expect(hs.every((h) => h.accepted && h.carries.length > 0)).toBe(true);
    const eps = await acme.ro<{ n: number }>("MATCH (a:Agent)-[:HAD]->(e:Episode) WHERE a.id IN ['researcher','coder','reviewer'] AND e.summary IS NOT NULL RETURN count(e) AS n");
    expect(eps[0].n).toBeGreaterThanOrEqual(3);
  });
});

describe("concurrency: race test", () => {
  it("8 agents, 50 tasks: all claimed, zero double claims", async () => {
    const r = await raceTest(acme, { agents: 8, tasks: 50 });
    expect(r.claimed).toBe(50);
    expect(r.doubleClaims).toBe(0);
    expect(Object.values(r.perAgent).reduce((a, b) => a + b, 0)).toBe(50);
    console.log(`race: ${JSON.stringify({ ...r, perAgent: undefined })}`);
  });
});

describe("tenant isolation for coordination", () => {
  it("tasks and handoffs in acme are invisible from a sandbox graph", async () => {
    await seedSandbox();
    const sbx = await TenantGraph.open(SANDBOX);
    const [{ n }] = await sbx.ro<{ n: number }>("MATCH (x) WHERE x:Task OR x:Handoff RETURN count(x) AS n");
    expect(n).toBe(0);
    await expect(contextCard(sbx, "coder")).rejects.toThrow(/unknown agent/);
  });
});
