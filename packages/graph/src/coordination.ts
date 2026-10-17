import { randomUUID } from "node:crypto";
import type { TenantGraph } from "./tenant";
import { remember, startEpisode, addTurn, endEpisode } from "./memory";

/**
 * Shared state for a crew of agents: tasks with an atomic, versioned claim, and handoffs that
 * must carry evidence (memories, passages or decisions already in the graph).
 * Every agent call is stateless; all state lives in the tenant's FalkorDB graph.
 */

export type TaskStatus = "todo" | "claimed" | "in_progress" | "handed_off" | "blocked" | "done";

export interface TaskRecord {
  id: string;
  title: string;
  status: TaskStatus;
  version: number;
  priority: number;
  createdAt: number;
  claimedBy: string | null;
  claimedAt: number | null;
  assignedTo: string | null;
  project: string | null;
}

export interface HandoffRecord {
  id: string;
  ts: number;
  note: string;
  accepted: boolean;
  from: string;
  to: string;
  task: string;
  carries: { id: string; label: string; text: string }[];
}

export class ClaimConflictError extends Error {
  constructor(readonly taskId: string) {
    super(`task ${taskId} was claimed or changed by another agent`);
  }
}

const id = (p: string) => `${p}-${randomUUID().slice(0, 8)}`;

const TASK_RETURN = `t.id AS id, t.title AS title, t.status AS status, t.version AS version, t.priority AS priority,
  t.created_at AS createdAt, t.claimed_by AS claimedBy, t.claimed_at AS claimedAt, t.assigned_to AS assignedTo, t.project AS project`;

export async function createTask(
  g: TenantGraph,
  input: { title: string; priority?: number; project?: string; id?: string; createdBy?: string },
): Promise<TaskRecord> {
  const tid = input.id ?? id("TK");
  const [row] = await g.query<TaskRecord>(
    `CREATE (t:Task {id: $id, title: $title, status: 'todo', version: 0, priority: $priority, created_at: $now,
       claimed_by: null, claimed_at: null, assigned_to: null, project: $project})
     WITH t OPTIONAL MATCH (p:Project {id: $project})
     FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | MERGE (t)-[:IN_PROJECT]->(p))
     WITH t OPTIONAL MATCH (c {id: $by}) WHERE c:Agent OR c:Person
     FOREACH (_ IN CASE WHEN c IS NULL THEN [] ELSE [1] END | MERGE (t)-[:CREATED_BY]->(c))
     RETURN ${TASK_RETURN}`,
    { id: tid, title: input.title, priority: input.priority ?? 2, now: Date.now(), project: input.project ?? null, by: input.createdBy ?? null },
  );
  return row;
}

export async function getTask(g: TenantGraph, taskId: string): Promise<TaskRecord | null> {
  const [row] = await g.ro<TaskRecord>(`MATCH (t:Task {id: $id}) RETURN ${TASK_RETURN}`, { id: taskId });
  return row ?? null;
}

export async function listTasks(g: TenantGraph): Promise<TaskRecord[]> {
  return g.ro<TaskRecord>(`MATCH (t:Task) RETURN ${TASK_RETURN} ORDER BY t.priority, t.created_at, t.id`);
}

/**
 * Compare-and-set claim in ONE Cypher query. It only matches when the task is still claimable
 * (todo, or handed off to this agent) and the version is the one the caller read. FalkorDB runs
 * each write query atomically on a graph, so at most one concurrent caller gets a row back.
 */
export async function claimTask(g: TenantGraph, taskId: string, agentId: string, expectedVersion: number): Promise<TaskRecord> {
  const [row] = await g.query<TaskRecord>(
    `MATCH (t:Task {id: $id}), (a:Agent {id: $agent})
     WHERE t.version = $v AND (t.status = 'todo' OR (t.status = 'handed_off' AND t.assigned_to = $agent))
     SET t.status = 'claimed', t.claimed_by = $agent, t.claimed_at = $now, t.version = t.version + 1, a.last_seen = $now
     MERGE (t)-[:CLAIMED_BY]->(a)
     RETURN ${TASK_RETURN}`,
    { id: taskId, agent: agentId, v: expectedVersion, now: Date.now() },
  );
  if (!row) throw new ClaimConflictError(taskId);
  return row;
}

/** Picks the highest-priority todo task and tries to claim it; retries on conflict. Null when none left. */
export async function claimNext(g: TenantGraph, agentId: string, maxTries = 20): Promise<TaskRecord | null> {
  for (let i = 0; i < maxTries; i++) {
    const open = await g.ro<{ id: string; version: number }>(
      "MATCH (t:Task {status: 'todo'}) RETURN t.id AS id, t.version AS version ORDER BY t.priority, t.created_at SKIP $skip LIMIT 1",
      { skip: Math.floor(Math.random() * Math.min(i + 1, 4)) },
    );
    if (!open.length) {
      const [{ n }] = await g.ro<{ n: number }>("MATCH (t:Task {status: 'todo'}) RETURN count(t) AS n");
      if (n === 0) return null;
      continue;
    }
    try {
      return await claimTask(g, open[0].id, agentId, open[0].version);
    } catch (e) {
      if (!(e instanceof ClaimConflictError)) throw e;
    }
  }
  return null;
}

async function setStatus(g: TenantGraph, taskId: string, agentId: string, from: TaskStatus[], to: TaskStatus): Promise<TaskRecord> {
  const [row] = await g.query<TaskRecord>(
    `MATCH (t:Task {id: $id}) WHERE t.claimed_by = $agent AND t.status IN $from
     SET t.status = $to, t.version = t.version + 1 RETURN ${TASK_RETURN}`,
    { id: taskId, agent: agentId, from, to },
  );
  if (!row) throw new Error(`task ${taskId} is not held by ${agentId} in status ${from.join("/")}`);
  return row;
}

export const startTask = (g: TenantGraph, taskId: string, agentId: string) => setStatus(g, taskId, agentId, ["claimed"], "in_progress");
export const completeTask = (g: TenantGraph, taskId: string, agentId: string) =>
  setStatus(g, taskId, agentId, ["claimed", "in_progress"], "done");

/**
 * Hand a task to another agent. Rejected unless it carries at least one existing Memory, Passage or
 * Decision id and the sender currently holds the task. The task becomes handed_off, assigned to the receiver.
 */
export async function handoff(
  g: TenantGraph,
  input: { taskId: string; from: string; to: string; note: string; carries: string[] },
): Promise<HandoffRecord> {
  if (!input.carries.length) throw new Error("a handoff must carry evidence (memory, passage or decision ids)");
  const found = await g.ro<{ id: string }>(
    "MATCH (x) WHERE (x:Memory OR x:Passage OR x:Decision) AND x.id IN $ids RETURN x.id AS id",
    { ids: input.carries },
  );
  if (found.length !== new Set(input.carries).size) {
    const have = new Set(found.map((r) => r.id));
    throw new Error(`handoff carries unknown evidence: ${input.carries.filter((c) => !have.has(c)).join(", ")}`);
  }
  const [to] = await g.ro<{ id: string }>("MATCH (a:Agent {id: $id}) RETURN a.id AS id", { id: input.to });
  if (!to) throw new Error(`unknown agent: ${input.to}`);

  const hid = id("H");
  const now = Date.now();
  const [row] = await g.query<{ id: string }>(
    `MATCH (t:Task {id: $task}) WHERE t.claimed_by = $from AND t.status IN ['claimed', 'in_progress']
     MATCH (f:Agent {id: $from}), (r:Agent {id: $to})
     SET t.status = 'handed_off', t.assigned_to = $to, t.claimed_by = null, t.version = t.version + 1
     CREATE (h:Handoff {id: $hid, ts: $now, note: $note, accepted: false})
     CREATE (h)-[:FROM]->(f), (h)-[:TO]->(r), (h)-[:OF]->(t)
     WITH h UNWIND $carries AS cid MATCH (x {id: cid}) WHERE x:Memory OR x:Passage OR x:Decision
     MERGE (h)-[:CARRIES]->(x)
     RETURN DISTINCT h.id AS id`,
    { task: input.taskId, from: input.from, to: input.to, hid, now, note: input.note, carries: input.carries },
  );
  if (!row) throw new Error(`task ${input.taskId} is not held by ${input.from}`);
  return (await getHandoff(g, hid))!;
}

export async function getHandoff(g: TenantGraph, hid: string): Promise<HandoffRecord | null> {
  const [row] = await g.ro<HandoffRecord>(
    `MATCH (h:Handoff {id: $id})-[:FROM]->(f), (h)-[:TO]->(r), (h)-[:OF]->(t)
     OPTIONAL MATCH (h)-[:CARRIES]->(x)
     WITH h, f, r, t, collect(CASE WHEN x IS NULL THEN null ELSE {id: x.id, label: labels(x)[0], text: coalesce(x.text, x.title)} END) AS carries
     RETURN h.id AS id, h.ts AS ts, h.note AS note, h.accepted AS accepted, f.id AS from, r.id AS to, t.id AS task, carries`,
    { id: hid },
  );
  return row ?? null;
}

export async function listHandoffs(g: TenantGraph, opts: { to?: string; task?: string } = {}): Promise<HandoffRecord[]> {
  const ids = await g.ro<{ id: string }>(
    `MATCH (h:Handoff)-[:TO]->(r), (h)-[:OF]->(t)
     WHERE ($to IS NULL OR r.id = $to) AND ($task IS NULL OR t.id = $task)
     RETURN h.id AS id ORDER BY h.ts, h.id`,
    { to: opts.to ?? null, task: opts.task ?? null },
  );
  const out: HandoffRecord[] = [];
  for (const r of ids) out.push((await getHandoff(g, r.id))!);
  return out;
}

/** Receiver accepts: marks the handoff accepted and claims the task with a version check. */
export async function acceptHandoff(g: TenantGraph, hid: string, agentId: string): Promise<TaskRecord> {
  const h = await getHandoff(g, hid);
  if (!h) throw new Error(`unknown handoff ${hid}`);
  if (h.to !== agentId) throw new Error(`handoff ${hid} is addressed to ${h.to}, not ${agentId}`);
  const t = await getTask(g, h.task);
  const claimed = await claimTask(g, h.task, agentId, t!.version);
  await g.query("MATCH (h:Handoff {id: $id}) SET h.accepted = true", { id: hid });
  return claimed;
}

export interface ContextCard {
  agent: { id: string; name: string; role: string };
  openTasks: TaskRecord[];
  lastEpisode: { id: string; summary: string | null; endedAt: number | null } | null;
  inbox: HandoffRecord[];
  memories: { id: string; text: string; writtenBy: string | null }[];
}

/**
 * What an agent sees when it starts a session: its tasks, its last episode summary, pending handoffs
 * addressed to it (with the evidence they carry), and valid memories scoped to its projects or the
 * task projects - including memories other agents wrote.
 */
export async function contextCard(g: TenantGraph, agentId: string, opts: { memoryLimit?: number; asOf?: number } = {}): Promise<ContextCard> {
  const asOf = opts.asOf ?? Date.now();
  const [agent] = await g.ro<{ id: string; name: string; role: string }>(
    "MATCH (a:Agent {id: $id}) RETURN a.id AS id, a.name AS name, a.role AS role",
    { id: agentId },
  );
  if (!agent) throw new Error(`unknown agent: ${agentId}`);
  const openTasks = await g.ro<TaskRecord>(
    `MATCH (t:Task) WHERE t.status <> 'done' AND (t.claimed_by = $id OR (t.status = 'handed_off' AND t.assigned_to = $id))
     RETURN ${TASK_RETURN} ORDER BY t.priority, t.created_at`,
    { id: agentId },
  );
  const [ep] = await g.ro<{ id: string; summary: string | null; endedAt: number | null }>(
    "MATCH (:Agent {id: $id})-[:HAD]->(e:Episode) RETURN e.id AS id, e.summary AS summary, e.ended_at AS endedAt ORDER BY e.started_at DESC LIMIT 1",
    { id: agentId },
  );
  const inbox = (await listHandoffs(g, { to: agentId })).filter((h) => !h.accepted);
  const memories = await g.ro<{ id: string; text: string; writtenBy: string | null }>(
    `MATCH (a:Agent {id: $id})-[:WORKS_ON]->(p:Project)<-[:SCOPED_TO]-(m:Memory)
     WHERE m.valid_from <= $asOf AND (m.valid_to IS NULL OR m.valid_to > $asOf)
     OPTIONAL MATCH (m)-[:WRITTEN_BY]->(w)
     RETURN DISTINCT m.id AS id, m.text AS text, w.id AS writtenBy, m.recorded_at AS rec ORDER BY rec DESC LIMIT $limit`,
    { id: agentId, asOf, limit: opts.memoryLimit ?? 10 },
  );
  return { agent, openTasks, lastEpisode: ep ?? null, inbox, memories: memories.map(({ id, text, writtenBy }) => ({ id, text, writtenBy })) };
}

export interface ScenarioStep {
  agent: string;
  action: string;
  detail: string;
  ids: string[];
}

/**
 * Deterministic, LLM-free demo scenario (PLAN.md scene 4): researcher -> coder -> reviewer -> coder.
 * Each agent starts a fresh episode, reads its context card from the graph, writes memories, and
 * hands off with evidence. Nothing is carried in process memory between agents.
 */
export async function runSignedUrlScenario(g: TenantGraph): Promise<{ taskId: string; steps: ScenarioStep[] }> {
  const steps: ScenarioStep[] = [];
  const log = (agent: string, action: string, detail: string, ids: string[] = []) => steps.push({ agent, action, detail, ids });

  const task = await createTask(g, { title: "Add signed URLs for lookbook videos", project: "storefront", priority: 1, createdBy: "omar" });
  log("omar", "create_task", task.title, [task.id]);

  // researcher
  const r = await claimTask(g, task.id, "researcher", task.version);
  log("researcher", "claim_task", `claimed at v${r.version}`, [task.id]);
  let ep = await startEpisode(g, { agentId: "researcher" });
  await addTurn(g, ep, { role: "agent", text: "Reading S-39 and the CloudFront notes for signed URL options." });
  const m1 = await remember(g, {
    text: "CloudFront signed URLs use a custom policy and an RSA key pair; links should expire within 1 hour for lookbook videos.",
    type: "semantic", sources: ["S-39"], writtenBy: "researcher", scopeProject: "storefront", mentions: ["cloudfront"],
  });
  const m2 = await remember(g, {
    text: "Current product pages still link the public S3 URLs; only lookbook video moves behind CloudFront signed URLs, so the storefront must serve both during the switch.",
    type: "semantic", sources: ["S-39"], writtenBy: "researcher", scopeProject: "storefront", mentions: ["cloudfront", "s3"],
  });
  log("researcher", "remember", "2 semantic memories with source S-39", [m1.memoryId!, m2.memoryId!]);
  await endEpisode(g, ep, { summary: "Researched CloudFront signed URLs; handed to coder with 2 memories." });
  const h1 = await handoff(g, { taskId: task.id, from: "researcher", to: "coder", note: "Implement CloudFront signed URLs; keep public links until the rollout ends.", carries: [m1.memoryId!, m2.memoryId!] });
  log("researcher", "handoff", "-> coder", [h1.id]);

  // coder: fresh session, learns only from the graph
  ep = await startEpisode(g, { agentId: "coder" });
  const card = await contextCard(g, "coder");
  log("coder", "context_card", `${card.inbox.length} handoff(s), ${card.memories.length} project memories`, card.inbox.map((h) => h.id));
  await acceptHandoff(g, h1.id, "coder");
  await startTask(g, task.id, "coder");
  const m3 = await remember(g, {
    text: "Implemented signedVideoUrl(key) for CloudFront and kept the public S3 URL path for the current catalogue.",
    type: "episodic", writtenBy: "coder", scopeProject: "storefront",
  });
  await endEpisode(g, ep, { summary: "Implemented signed URLs; sent to reviewer." });
  const h2 = await handoff(g, { taskId: task.id, from: "coder", to: "reviewer", note: "Please review signedVideoUrl.", carries: [m3.memoryId!, m1.memoryId!] });
  log("coder", "handoff", "-> reviewer", [h2.id, m3.memoryId!]);

  // reviewer flags missing expiry, hands back
  ep = await startEpisode(g, { agentId: "reviewer" });
  await acceptHandoff(g, h2.id, "reviewer");
  const m4 = await remember(g, {
    text: "Review: signedVideoUrl sets no expiry; researcher's memory says links must expire within 1 hour.",
    type: "episodic", writtenBy: "reviewer", scopeProject: "storefront",
  });
  await endEpisode(g, ep, { summary: "Requested changes: missing expiry." });
  const h3 = await handoff(g, { taskId: task.id, from: "reviewer", to: "coder", note: "Add a 1 hour expiry.", carries: [m4.memoryId!, m1.memoryId!] });
  log("reviewer", "handoff", "-> coder (changes requested)", [h3.id, m4.memoryId!]);

  // coder fixes and completes
  await acceptHandoff(g, h3.id, "coder");
  await completeTask(g, task.id, "coder");
  log("coder", "complete_task", "expiry added; task done", [task.id]);
  return { taskId: task.id, steps };
}

export interface RaceResult {
  agents: number;
  tasks: number;
  claimed: number;
  doubleClaims: number;
  conflicts: number;
  p50ms: number;
  p95ms: number;
  perAgent: Record<string, number>;
}

/**
 * N agents claim M tasks concurrently through claimNext. Afterwards the graph is checked: every task
 * must have exactly one CLAIMED_BY edge. Numbers are measured, not assumed.
 */
export async function raceTest(g: TenantGraph, opts: { agents?: number; tasks?: number } = {}): Promise<RaceResult> {
  const nAgents = opts.agents ?? 8;
  const nTasks = opts.tasks ?? 50;
  const agentIds = Array.from({ length: nAgents }, (_, i) => `race-${i + 1}`);
  await g.query("MATCH (t:Task) WHERE t.id STARTS WITH 'RACE-' DETACH DELETE t");
  await g.query("UNWIND $ids AS a MERGE (x:Agent {id: a}) SET x.name = a, x.role = 'race test', x.status = 'idle'", { ids: agentIds });
  await g.query(
    "UNWIND range(1, $n) AS i CREATE (:Task {id: 'RACE-' + toString(i), title: 'race task ' + toString(i), status: 'todo', version: 0, priority: 5, created_at: i})",
    { n: nTasks },
  );
  const lat: number[] = [];
  let conflicts = 0;
  const perAgent: Record<string, number> = {};
  await Promise.all(
    agentIds.map(async (a) => {
      perAgent[a] = 0;
      for (;;) {
        const open = await g.ro<{ id: string; version: number }>(
          "MATCH (t:Task {status: 'todo'}) WHERE t.id STARTS WITH 'RACE-' RETURN t.id AS id, t.version AS version ORDER BY t.created_at LIMIT 3",
        );
        if (!open.length) return;
        const pick = open[Math.floor(Math.random() * open.length)];
        const t0 = performance.now();
        try {
          await claimTask(g, pick.id, a, pick.version);
          perAgent[a]++;
        } catch (e) {
          if (!(e instanceof ClaimConflictError)) throw e;
          conflicts++;
        } finally {
          lat.push(performance.now() - t0);
        }
      }
    }),
  );
  const [{ claimed }] = await g.ro<{ claimed: number }>(
    "MATCH (t:Task) WHERE t.id STARTS WITH 'RACE-' AND t.status = 'claimed' RETURN count(t) AS claimed",
  );
  const [{ doubles }] = await g.ro<{ doubles: number }>(
    "MATCH (t:Task)-[c:CLAIMED_BY]->() WHERE t.id STARTS WITH 'RACE-' WITH t, count(c) AS n WHERE n > 1 RETURN count(t) AS doubles",
  );
  lat.sort((x, y) => x - y);
  const q = (p: number) => Math.round((lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] ?? 0) * 10) / 10;
  return { agents: nAgents, tasks: nTasks, claimed, doubleClaims: doubles, conflicts, p50ms: q(0.5), p95ms: q(0.95), perAgent };
}
