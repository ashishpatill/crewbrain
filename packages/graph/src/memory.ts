import { createHash, randomUUID } from "node:crypto";
import type { TenantGraph } from "./tenant";

export type MemoryType = "episodic" | "semantic" | "procedural";
export type Epistemic = "fact" | "observation" | "opinion";
export type ProposalKind = "decision" | "procedure" | "memory";
export type ProposalStatus = "pending" | "approved" | "rejected" | "edited";

export interface MemoryRecord {
  id: string;
  text: string;
  type: MemoryType;
  epistemic: Epistemic;
  confidence: number;
  validFrom: number;
  validTo: number | null;
  recordedAt: number;
  heat: number;
  writtenBy: string | null;
  sources: string[];
  mentions: string[];
  supersedes: string[];
  supersededBy: string[];
}

export interface EpisodeRecord {
  id: string;
  sessionId: string;
  agentId: string;
  startedAt: number;
  endedAt: number | null;
  summary: string | null;
  turns: { id: string; role: string; text: string; ts: number }[];
}

export interface DecisionProposalPayload {
  kind: "decision";
  title: string;
  statement: string;
  chose: string[];
  rejected: { entity: string; reason: string }[];
  about?: string[];
  project?: string | null;
  decided_by: string;
  approved_by?: string | null;
  supersedes?: string | null;
  partial?: boolean;
  reasons: { id?: string; kind: string; text: string; passages: string[] }[];
  source_id: string;
}

export interface ProcedureProposalPayload {
  kind: "procedure";
  name: string;
  steps: string[];
  learned_from_episode?: string | null;
  agent_id?: string | null;
}

export interface MemoryProposalPayload {
  kind: "memory";
  text: string;
  type: MemoryType;
  epistemic: Epistemic;
  sources: string[];
  supersedes?: string | null;
  written_by?: string | null;
  confidence?: number;
}

export type ProposalPayload = DecisionProposalPayload | ProcedureProposalPayload | MemoryProposalPayload;

export interface ProposalRecord {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  payload: ProposalPayload;
  createdAt: number;
  decidedBy: string | null;
  decidedAt: number | null;
  createdBy: string | null;
}

export interface TimelineEvent {
  ts: number;
  kind: "decision" | "memory" | "source" | "proposal" | "episode" | "procedure";
  id: string;
  title: string;
  status: string | null;
  actor: string | null;
  detail: string | null;
  validFrom: number | null;
  validTo: number | null;
}

const INF = Number.MAX_SAFE_INTEGER;

function newId(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function parsePayload(raw: string): ProposalPayload {
  return JSON.parse(raw) as ProposalPayload;
}

/** Semantic memory needs ≥1 source id that exists in this tenant. Procedural memory becomes a proposal. */
export async function remember(
  g: TenantGraph,
  input: {
    text: string;
    type: MemoryType;
    epistemic?: Epistemic;
    sources?: string[];
    writtenBy?: string;
    confidence?: number;
    validFrom?: number;
    supersedes?: string;
    mentions?: string[];
    scopeProject?: string;
    scopeAgent?: string;
    /** If true, procedural memory is written immediately (tests only). Prefer proposeProcedure. */
    forceWrite?: boolean;
  },
): Promise<{ memoryId?: string; proposalId?: string }> {
  if (input.type === "procedural" && !input.forceWrite) {
    const proposalId = await createProposal(g, {
      kind: "procedure",
      name: input.text.slice(0, 80),
      steps: input.text.split(/\n+/).map((s) => s.trim()).filter(Boolean),
      agent_id: input.writtenBy ?? null,
    }, input.writtenBy ?? "agent");
    return { proposalId };
  }

  const sources = input.sources ?? [];
  if (input.type === "semantic" && sources.length < 1) {
    throw new Error("semantic memory requires at least one source id");
  }
  if (sources.length) {
    const found = await g.ro<{ id: string }>("MATCH (s:Source) WHERE s.id IN $ids RETURN s.id AS id", { ids: sources });
    if (found.length !== sources.length) {
      const have = new Set(found.map((r) => r.id));
      throw new Error(`unknown source ids: ${sources.filter((s) => !have.has(s)).join(", ")}`);
    }
  }

  const id = newId("M");
  const now = Date.now();
  const validFrom = input.validFrom ?? now;
  await g.query(
    `CREATE (m:Memory {
       id: $id, text: $text, type: $type, epistemic: $epistemic, confidence: $confidence,
       valid_from: $validFrom, valid_to: null, recorded_at: $now, heat: 0
     })`,
    {
      id,
      text: input.text,
      type: input.type,
      epistemic: input.epistemic ?? "fact",
      confidence: input.confidence ?? 0.8,
      validFrom,
      now,
    },
  );
  if (input.writtenBy) {
    await g.query(
      "MATCH (m:Memory {id: $id}) OPTIONAL MATCH (a:Agent {id: $by}) OPTIONAL MATCH (p:Person {id: $by}) FOREACH (_ IN CASE WHEN a IS NULL THEN [] ELSE [1] END | MERGE (m)-[:WRITTEN_BY]->(a)) FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | MERGE (m)-[:WRITTEN_BY]->(p))",
      { id, by: input.writtenBy },
    );
  }
  if (sources.length) {
    await g.query(
      "MATCH (m:Memory {id: $id}) UNWIND $ids AS sid MATCH (s:Source {id: sid}) MERGE (m)-[:DERIVED_FROM]->(s)",
      { id, ids: sources },
    );
  }
  const mentions = input.mentions ?? [];
  if (mentions.length) {
    await g.query(
      `MATCH (m:Memory {id: $id}) UNWIND $ids AS mid
       OPTIONAL MATCH (e:Entity {id: mid}) OPTIONAL MATCH (p:Person {id: mid}) OPTIONAL MATCH (pr:Project {id: mid})
       FOREACH (_ IN CASE WHEN e IS NULL THEN [] ELSE [1] END | MERGE (m)-[:MENTIONS]->(e))
       FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | MERGE (m)-[:MENTIONS]->(p))
       FOREACH (_ IN CASE WHEN pr IS NULL THEN [] ELSE [1] END | MERGE (m)-[:MENTIONS]->(pr))`,
      { id, ids: mentions },
    );
  }
  if (input.scopeProject) {
    await g.query("MATCH (m:Memory {id: $id}), (p:Project {id: $p}) MERGE (m)-[:SCOPED_TO]->(p)", { id, p: input.scopeProject });
  }
  if (input.scopeAgent) {
    await g.query("MATCH (m:Memory {id: $id}), (a:Agent {id: $a}) MERGE (m)-[:SCOPED_TO]->(a)", { id, a: input.scopeAgent });
  }
  if (input.supersedes) {
    await supersedeMemory(g, id, input.supersedes, validFrom);
  }
  return { memoryId: id };
}

/** Close old memory (set valid_to) and link SUPERSEDES. Old node is never deleted. */
export async function supersedeMemory(g: TenantGraph, newId: string, oldId: string, at = Date.now()): Promise<void> {
  const rows = await g.query<{ n: number }>(
    `MATCH (neu:Memory {id: $newId}), (old:Memory {id: $oldId})
     WHERE old.valid_to IS NULL OR old.valid_to > $at
     SET old.valid_to = $at
     MERGE (neu)-[:SUPERSEDES]->(old)
     RETURN 1 AS n`,
    { newId, oldId, at },
  );
  if (!rows.length) throw new Error(`cannot supersede: missing memories ${newId} / ${oldId}`);
}

export async function startEpisode(
  g: TenantGraph,
  input: { agentId: string; sessionId?: string; startedAt?: number },
): Promise<string> {
  const id = newId("E");
  const sessionId = input.sessionId ?? newId("sess");
  const startedAt = input.startedAt ?? Date.now();
  await g.query(
    `MATCH (a:Agent {id: $agentId})
     CREATE (e:Episode {id: $id, session_id: $sessionId, started_at: $startedAt, ended_at: null, summary: null})
     CREATE (a)-[:HAD]->(e)
     RETURN e.id AS id`,
    { id, sessionId, startedAt, agentId: input.agentId },
  );
  return id;
}

export async function addTurn(
  g: TenantGraph,
  episodeId: string,
  input: { role: string; text: string; ts?: number },
): Promise<string> {
  const id = newId("T");
  const ts = input.ts ?? Date.now();
  await g.query(
    `MATCH (e:Episode {id: $episodeId})
     CREATE (t:Turn {id: $id, role: $role, text: $text, ts: $ts})
     CREATE (e)-[:HAS_TURN]->(t)`,
    { episodeId, id, role: input.role, text: input.text, ts },
  );
  return id;
}

export async function endEpisode(
  g: TenantGraph,
  episodeId: string,
  input: { summary: string; memoryIds?: string[]; endedAt?: number } = { summary: "" },
): Promise<void> {
  const endedAt = input.endedAt ?? Date.now();
  await g.query(
    "MATCH (e:Episode {id: $id}) SET e.ended_at = $endedAt, e.summary = $summary",
    { id: episodeId, endedAt, summary: input.summary },
  );
  if (input.memoryIds?.length) {
    await g.query(
      "MATCH (e:Episode {id: $id}) UNWIND $ids AS mid MATCH (m:Memory {id: mid}) MERGE (e)-[:PRODUCED]->(m) MERGE (m)-[:DERIVED_FROM]->(e)",
      { id: episodeId, ids: input.memoryIds },
    );
  }
}

/** Increment heat on recall; only returns memories valid at asOf. */
export async function recallMemories(
  g: TenantGraph,
  opts: { query?: string; asOf?: number; limit?: number; type?: MemoryType } = {},
): Promise<MemoryRecord[]> {
  const asOf = opts.asOf ?? Date.now();
  const limit = opts.limit ?? 20;
  const rows = await g.query<{
    id: string; text: string; type: MemoryType; epistemic: Epistemic; confidence: number;
    validFrom: number; validTo: number | null; recordedAt: number; heat: number; writtenBy: string | null;
  }>(
    `MATCH (m:Memory)
     WHERE m.valid_from <= $asOf AND (m.valid_to IS NULL OR m.valid_to > $asOf)
       AND ($type IS NULL OR m.type = $type)
       AND ($q IS NULL OR toLower(m.text) CONTAINS toLower($q))
     OPTIONAL MATCH (m)-[:WRITTEN_BY]->(w)
     WITH m, w ORDER BY m.heat DESC, m.recorded_at DESC LIMIT $limit
     SET m.heat = coalesce(m.heat, 0) + 1
     RETURN m.id AS id, m.text AS text, m.type AS type, m.epistemic AS epistemic, m.confidence AS confidence,
       m.valid_from AS validFrom, m.valid_to AS validTo, m.recorded_at AS recordedAt, m.heat AS heat,
       w.id AS writtenBy`,
    { asOf, limit, type: opts.type ?? null, q: opts.query ?? null },
  );
  const out: MemoryRecord[] = [];
  for (const r of rows) {
    const sources = await g.ro<{ id: string }>("MATCH (m:Memory {id: $id})-[:DERIVED_FROM]->(s:Source) RETURN s.id AS id", { id: r.id });
    const mentions = await g.ro<{ id: string }>("MATCH (m:Memory {id: $id})-[:MENTIONS]->(x) RETURN x.id AS id", { id: r.id });
    const supersedes = await g.ro<{ id: string }>("MATCH (m:Memory {id: $id})-[:SUPERSEDES]->(o:Memory) RETURN o.id AS id", { id: r.id });
    const supersededBy = await g.ro<{ id: string }>("MATCH (n:Memory)-[:SUPERSEDES]->(m:Memory {id: $id}) RETURN n.id AS id", { id: r.id });
    out.push({
      ...r,
      sources: sources.map((s) => s.id),
      mentions: mentions.map((s) => s.id),
      supersedes: supersedes.map((s) => s.id),
      supersededBy: supersededBy.map((s) => s.id),
    });
  }
  return out;
}

export async function getMemory(g: TenantGraph, id: string, asOf = Date.now()): Promise<MemoryRecord | null> {
  const [r] = await g.ro<{
    id: string; text: string; type: MemoryType; epistemic: Epistemic; confidence: number;
    validFrom: number; validTo: number | null; recordedAt: number; heat: number; writtenBy: string | null;
  }>(
    `MATCH (m:Memory {id: $id})
     WHERE m.valid_from <= $asOf AND (m.valid_to IS NULL OR m.valid_to > $asOf)
     OPTIONAL MATCH (m)-[:WRITTEN_BY]->(w)
     RETURN m.id AS id, m.text AS text, m.type AS type, m.epistemic AS epistemic, m.confidence AS confidence,
       m.valid_from AS validFrom, m.valid_to AS validTo, m.recorded_at AS recordedAt, m.heat AS heat, w.id AS writtenBy`,
    { id, asOf },
  );
  if (!r) return null;
  const sources = await g.ro<{ id: string }>("MATCH (m:Memory {id: $id})-[:DERIVED_FROM]->(s:Source) RETURN s.id AS id", { id });
  const mentions = await g.ro<{ id: string }>("MATCH (m:Memory {id: $id})-[:MENTIONS]->(x) RETURN x.id AS id", { id });
  const supersedes = await g.ro<{ id: string }>("MATCH (m:Memory {id: $id})-[:SUPERSEDES]->(o:Memory) RETURN o.id AS id", { id });
  const supersededBy = await g.ro<{ id: string }>("MATCH (n:Memory)-[:SUPERSEDES]->(m:Memory {id: $id}) RETURN n.id AS id", { id });
  return {
    ...r,
    sources: sources.map((s) => s.id),
    mentions: mentions.map((s) => s.id),
    supersedes: supersedes.map((s) => s.id),
    supersededBy: supersededBy.map((s) => s.id),
  };
}

export async function createProposal(
  g: TenantGraph,
  payload: ProposalPayload,
  createdBy: string,
): Promise<string> {
  const id = newId("PR");
  const now = Date.now();
  await g.query(
    `CREATE (p:Proposal {
       id: $id, kind: $kind, payload_json: $payload, status: 'pending',
       created_at: $now, decided_by: null, decided_at: null, created_by: $createdBy
     })`,
    { id, kind: payload.kind, payload: JSON.stringify(payload), now, createdBy },
  );
  return id;
}

export async function listProposals(
  g: TenantGraph,
  opts: { status?: ProposalStatus } = {},
): Promise<ProposalRecord[]> {
  const rows = await g.ro<{
    id: string; kind: ProposalKind; payload: string; status: ProposalStatus;
    createdAt: number; decidedBy: string | null; decidedAt: number | null; createdBy: string | null;
  }>(
    `MATCH (p:Proposal)
     WHERE $status IS NULL OR p.status = $status
     RETURN p.id AS id, p.kind AS kind, p.payload_json AS payload, p.status AS status,
       p.created_at AS createdAt, p.decided_by AS decidedBy, p.decided_at AS decidedAt, p.created_by AS createdBy
     ORDER BY p.created_at DESC`,
    { status: opts.status ?? null },
  );
  return rows.map((r) => ({ ...r, payload: parsePayload(r.payload) }));
}

/** Agents cannot approve. `actor` must be a Person id. */
export async function decideProposal(
  g: TenantGraph,
  proposalId: string,
  input: { actor: string; action: "approve" | "reject" | "edit"; editedPayload?: ProposalPayload },
): Promise<{ proposalId: string; createdIds: string[] }> {
  const people = await g.ro<{ id: string }>("MATCH (p:Person {id: $id}) RETURN p.id AS id", { id: input.actor });
  if (!people.length) throw new Error("only a Person may approve, edit or reject a proposal (agents cannot)");

  const [row] = await g.ro<{ id: string; status: string; payload: string; kind: ProposalKind }>(
    "MATCH (p:Proposal {id: $id}) RETURN p.id AS id, p.status AS status, p.payload_json AS payload, p.kind AS kind",
    { id: proposalId },
  );
  if (!row) throw new Error(`proposal not found: ${proposalId}`);
  if (row.status !== "pending") throw new Error(`proposal ${proposalId} is already ${row.status}`);

  const now = Date.now();
  if (input.action === "reject") {
    await g.query(
      "MATCH (p:Proposal {id: $id}) SET p.status = 'rejected', p.decided_by = $actor, p.decided_at = $now",
      { id: proposalId, actor: input.actor, now },
    );
    return { proposalId, createdIds: [] };
  }

  let payload = parsePayload(row.payload);
  if (input.action === "edit") {
    if (!input.editedPayload) throw new Error("edit requires editedPayload");
    payload = input.editedPayload;
    await g.query(
      "MATCH (p:Proposal {id: $id}) SET p.payload_json = $payload, p.status = 'edited'",
      { id: proposalId, payload: JSON.stringify(payload) },
    );
  }

  const createdIds = await applyProposal(g, payload, input.actor, now);
  await g.query(
    "MATCH (p:Proposal {id: $id}) SET p.status = 'approved', p.decided_by = $actor, p.decided_at = $now, p.payload_json = $payload",
    { id: proposalId, actor: input.actor, now, payload: JSON.stringify(payload) },
  );
  // Link proposal to created decision/procedure when applicable.
  for (const cid of createdIds) {
    await g.query(
      `MATCH (p:Proposal {id: $pid})
       OPTIONAL MATCH (d:Decision {id: $cid}) OPTIONAL MATCH (pr:Procedure {id: $cid}) OPTIONAL MATCH (m:Memory {id: $cid})
       FOREACH (_ IN CASE WHEN d IS NULL THEN [] ELSE [1] END | MERGE (p)-[:WOULD_CREATE]->(d))
       FOREACH (_ IN CASE WHEN pr IS NULL THEN [] ELSE [1] END | MERGE (p)-[:WOULD_CREATE]->(pr))
       FOREACH (_ IN CASE WHEN m IS NULL THEN [] ELSE [1] END | MERGE (p)-[:WOULD_CREATE]->(m))`,
      { pid: proposalId, cid },
    );
  }
  return { proposalId, createdIds };
}

async function applyProposal(
  g: TenantGraph,
  payload: ProposalPayload,
  actor: string,
  now: number,
): Promise<string[]> {
  if (payload.kind === "decision") return [await applyDecisionProposal(g, payload, actor, now)];
  if (payload.kind === "procedure") return [await applyProcedureProposal(g, payload, now)];
  const { memoryId } = await remember(g, {
    text: payload.text,
    type: payload.type,
    epistemic: payload.epistemic,
    sources: payload.sources,
    writtenBy: payload.written_by ?? undefined,
    confidence: payload.confidence,
    supersedes: payload.supersedes ?? undefined,
    forceWrite: true,
  });
  return memoryId ? [memoryId] : [];
}

async function applyDecisionProposal(
  g: TenantGraph,
  p: DecisionProposalPayload,
  actor: string,
  now: number,
): Promise<string> {
  const id = newId("D");
  await g.query(
    `CREATE (d:Decision {
       id: $id, title: $title, statement: $statement, status: 'accepted',
       decided_at: $now, valid_from: $now, valid_to: null, recorded_at: $now, confidence: 0.9
     })`,
    { id, title: p.title, statement: p.statement, now },
  );
  const about = p.about ?? [...p.chose, ...p.rejected.map((r) => r.entity)];
  if (about.length) {
    await g.query("MATCH (d:Decision {id: $id}) UNWIND $ids AS e MATCH (x:Entity {id: e}) MERGE (d)-[:ABOUT]->(x)", { id, ids: about });
  }
  if (p.project) {
    await g.query("MATCH (d:Decision {id: $id}), (pr:Project {id: $p}) MERGE (d)-[:ABOUT]->(pr)", { id, p: p.project });
  }
  if (p.chose.length) {
    await g.query("MATCH (d:Decision {id: $id}) UNWIND $ids AS e MATCH (x:Entity {id: e}) MERGE (d)-[:CHOSE]->(x)", { id, ids: p.chose });
  }
  if (p.rejected.length) {
    await g.query(
      "MATCH (d:Decision {id: $id}) UNWIND $rows AS r MATCH (x:Entity {id: r.entity}) MERGE (d)-[j:REJECTED]->(x) SET j.reason = r.reason",
      { id, rows: p.rejected },
    );
  }
  await g.query("MATCH (d:Decision {id: $id}), (person:Person {id: $p}) MERGE (d)-[:DECIDED_BY]->(person)", {
    id,
    p: p.decided_by,
  });
  const approver = p.approved_by ?? actor;
  await g.query("MATCH (d:Decision {id: $id}), (person:Person {id: $p}) MERGE (d)-[:APPROVED_BY]->(person)", {
    id,
    p: approver,
  });
  await g.query("MATCH (d:Decision {id: $id}), (s:Source {id: $s}) MERGE (d)-[:RECORDED_IN]->(s)", { id, s: p.source_id });

  for (const [i, r] of p.reasons.entries()) {
    const rid = r.id ?? `${id}-R${i + 1}`;
    await g.query(
      `MATCH (d:Decision {id: $id})
       MERGE (x:Reason {id: $rid}) SET x.text = $text, x.kind = $kind
       MERGE (d)-[:BECAUSE]->(x)
       WITH x UNWIND range(0, size($passages) - 1) AS i
       MATCH (p:Passage {id: $passages[i]})
       MERGE (x)-[s:SUPPORTED_BY]->(p) SET s.rank = i`,
      { id, rid, text: r.text, kind: r.kind, passages: r.passages },
    );
  }

  if (p.supersedes) {
    await g.query(
      `MATCH (neu:Decision {id: $id}), (old:Decision {id: $old})
       SET old.status = 'superseded', old.valid_to = $now
       MERGE (neu)-[:SUPERSEDES {partial: $partial}]->(old)`,
      { id, old: p.supersedes, now, partial: p.partial ?? false },
    );
  }
  return id;
}

async function applyProcedureProposal(g: TenantGraph, p: ProcedureProposalPayload, now: number): Promise<string> {
  const id = newId("PROC");
  await g.query(
    `CREATE (pr:Procedure {id: $id, name: $name, steps: $steps, version: 1, status: 'accepted', recorded_at: $now})`,
    { id, name: p.name, steps: p.steps, now },
  );
  if (p.learned_from_episode) {
    await g.query(
      "MATCH (pr:Procedure {id: $id}), (e:Episode {id: $e}) MERGE (pr)-[:LEARNED_FROM]->(e)",
      { id, e: p.learned_from_episode },
    );
  }
  if (p.agent_id) {
    await g.query(
      "MATCH (pr:Procedure {id: $id}), (a:Agent {id: $a}) MERGE (a)-[:KNOWS {strength: 1.0}]->(pr)",
      { id, a: p.agent_id },
    );
  }
  return id;
}

export async function listTimeline(
  g: TenantGraph,
  opts: {
    asOf?: number;
    projectId?: string;
    agentId?: string;
    type?: TimelineEvent["kind"] | "all";
    limit?: number;
  } = {},
): Promise<TimelineEvent[]> {
  const asOf = opts.asOf ?? Date.now();
  const limit = opts.limit ?? 100;
  const want = opts.type && opts.type !== "all" ? opts.type : null;
  const events: TimelineEvent[] = [];

  if (!want || want === "decision") {
    const rows = await g.ro<{
      id: string; title: string; status: string; ts: number; actor: string | null; validFrom: number; validTo: number | null;
    }>(
      `MATCH (d:Decision)
       WHERE d.valid_from <= $asOf
       OPTIONAL MATCH (d)-[:DECIDED_BY]->(p:Person)
       OPTIONAL MATCH (d)-[:ABOUT]->(pr:Project)
       WHERE $projectId IS NULL OR pr.id = $projectId
       RETURN d.id AS id, d.title AS title, d.status AS status, d.decided_at AS ts, p.name AS actor,
         d.valid_from AS validFrom, d.valid_to AS validTo
       ORDER BY ts DESC LIMIT $limit`,
      { asOf, projectId: opts.projectId ?? null, limit },
    );
    for (const r of rows) {
      events.push({
        ts: r.ts,
        kind: "decision",
        id: r.id,
        title: r.title,
        status: r.status,
        actor: r.actor,
        detail: r.validTo && r.validTo <= asOf ? `closed ${new Date(r.validTo).toISOString().slice(0, 10)}` : null,
        validFrom: r.validFrom,
        validTo: r.validTo,
      });
    }
  }

  if (!want || want === "memory") {
    const rows = await g.ro<{
      id: string; text: string; type: string; ts: number; actor: string | null; validFrom: number; validTo: number | null;
    }>(
      `MATCH (m:Memory)
       WHERE m.valid_from <= $asOf
       OPTIONAL MATCH (m)-[:WRITTEN_BY]->(w)
       OPTIONAL MATCH (m)-[:SCOPED_TO]->(pr:Project)
       OPTIONAL MATCH (m)-[:SCOPED_TO]->(ag:Agent)
       WHERE ($projectId IS NULL OR pr.id = $projectId)
         AND ($agentId IS NULL OR ag.id = $agentId OR w.id = $agentId)
       RETURN m.id AS id, m.text AS text, m.type AS type, m.recorded_at AS ts, coalesce(w.name, w.id) AS actor,
         m.valid_from AS validFrom, m.valid_to AS validTo
       ORDER BY ts DESC LIMIT $limit`,
      { asOf, projectId: opts.projectId ?? null, agentId: opts.agentId ?? null, limit },
    );
    for (const r of rows) {
      events.push({
        ts: r.ts,
        kind: "memory",
        id: r.id,
        title: r.text.slice(0, 120),
        status: r.type,
        actor: r.actor,
        detail: r.validTo && r.validTo <= asOf ? "superseded" : null,
        validFrom: r.validFrom,
        validTo: r.validTo,
      });
    }
  }

  if (!want || want === "source") {
    const rows = await g.ro<{ id: string; title: string; kind: string; ts: number; actor: string | null }>(
      `MATCH (s:Source)
       WHERE s.created_at <= $asOf
       RETURN s.id AS id, s.title AS title, s.kind AS kind, s.created_at AS ts, s.author_ref AS actor
       ORDER BY ts DESC LIMIT $limit`,
      { asOf, limit },
    );
    for (const r of rows) {
      events.push({
        ts: r.ts,
        kind: "source",
        id: r.id,
        title: r.title,
        status: r.kind,
        actor: r.actor,
        detail: null,
        validFrom: r.ts,
        validTo: null,
      });
    }
  }

  if (!want || want === "proposal") {
    const rows = await g.ro<{ id: string; kind: string; status: string; ts: number; actor: string | null; payload: string }>(
      `MATCH (p:Proposal)
       WHERE p.created_at <= $asOf
       RETURN p.id AS id, p.kind AS kind, p.status AS status, p.created_at AS ts, p.created_by AS actor, p.payload_json AS payload
       ORDER BY ts DESC LIMIT $limit`,
      { asOf, limit },
    );
    for (const r of rows) {
      let title = r.kind;
      try {
        const pl = parsePayload(r.payload);
        title = pl.kind === "decision" ? pl.title : pl.kind === "procedure" ? pl.name : pl.text.slice(0, 80);
      } catch { /* keep */ }
      events.push({
        ts: r.ts,
        kind: "proposal",
        id: r.id,
        title,
        status: r.status,
        actor: r.actor,
        detail: r.kind,
        validFrom: r.ts,
        validTo: null,
      });
    }
  }

  if (!want || want === "episode") {
    const rows = await g.ro<{ id: string; summary: string | null; ts: number; actor: string | null; ended: number | null }>(
      `MATCH (a:Agent)-[:HAD]->(e:Episode)
       WHERE e.started_at <= $asOf AND ($agentId IS NULL OR a.id = $agentId)
       RETURN e.id AS id, e.summary AS summary, e.started_at AS ts, a.name AS actor, e.ended_at AS ended
       ORDER BY ts DESC LIMIT $limit`,
      { asOf, agentId: opts.agentId ?? null, limit },
    );
    for (const r of rows) {
      events.push({
        ts: r.ts,
        kind: "episode",
        id: r.id,
        title: r.summary || "agent session",
        status: r.ended ? "closed" : "open",
        actor: r.actor,
        detail: null,
        validFrom: r.ts,
        validTo: r.ended,
      });
    }
  }

  if (!want || want === "procedure") {
    const rows = await g.ro<{ id: string; name: string; status: string; ts: number }>(
      `MATCH (pr:Procedure)
       WHERE coalesce(pr.recorded_at, 0) <= $asOf
       RETURN pr.id AS id, pr.name AS name, pr.status AS status, coalesce(pr.recorded_at, 0) AS ts
       ORDER BY ts DESC LIMIT $limit`,
      { asOf, limit },
    );
    for (const r of rows) {
      events.push({
        ts: r.ts,
        kind: "procedure",
        id: r.id,
        title: r.name,
        status: r.status,
        actor: null,
        detail: null,
        validFrom: r.ts,
        validTo: null,
      });
    }
  }

  events.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
  return events.slice(0, limit);
}

/**
 * Ingest a short pasted document without an LLM: chunk into passages, write Source,
 * and open a reviewable memory proposal for the document. If the text looks like the
 * signed-URL chat, additionally open a structured decision proposal that partly
 * supersedes D-07 (which takes precedence over the generic memory proposal).
 */
export async function ingestDocument(
  g: TenantGraph,
  input: {
    text: string;
    title: string;
    kind?: string;
    author?: string;
    createdAt?: number;
  },
): Promise<{ sourceId: string; passageIds: string[]; proposalId: string | null }> {
  const body = input.text.trim();
  if (!body) throw new Error("empty document");
  const kind = input.kind ?? "chat";
  const author = input.author ?? "scribe";
  const createdAt = input.createdAt ?? Date.now();
  const hash = createHash("sha256").update(body).digest("hex");

  // Idempotent on hash within this tenant.
  const existing = await g.ro<{ id: string }>("MATCH (s:Source {hash: $hash}) RETURN s.id AS id LIMIT 1", { hash });
  if (existing.length) {
    const sourceId = existing[0].id;
    const passages = await g.ro<{ id: string }>(
      "MATCH (p:Passage)-[:PART_OF]->(s:Source {id: $id}) RETURN p.id AS id ORDER BY p.idx",
      { id: sourceId },
    );
    const pending = await g.ro<{ id: string }>(
      `MATCH (pr:Proposal {status: 'pending'})
       WHERE pr.payload_json CONTAINS $sid
       RETURN pr.id AS id LIMIT 1`,
      { sid: sourceId },
    );
    return { sourceId, passageIds: passages.map((p) => p.id), proposalId: pending[0]?.id ?? null };
  }

  const num = randomUUID().slice(0, 4);
  const sourceId = `S-ing-${num}`;
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks = paragraphs.length ? paragraphs : [body.replace(/\s+/g, " ").trim()];
  const passageIds = chunks.map((_, i) => `P-ing-${num}-${i}`);

  await g.query(
    `MERGE (s:Source {id: $id})
     SET s.kind = $kind, s.title = $title, s.author_ref = $author, s.created_at = $createdAt,
         s.hash = $hash, s.url = 'ingest://' + $id
     WITH s
     OPTIONAL MATCH (person:Person {id: $author}) OPTIONAL MATCH (agent:Agent {id: $author})
     FOREACH (_ IN CASE WHEN person IS NULL THEN [] ELSE [1] END | MERGE (s)-[:AUTHORED_BY]->(person))
     FOREACH (_ IN CASE WHEN agent IS NULL THEN [] ELSE [1] END | MERGE (s)-[:AUTHORED_BY]->(agent))`,
    { id: sourceId, kind, title: input.title, author, createdAt, hash },
  );
  await g.query(
    `UNWIND $rows AS r MATCH (s:Source {id: $sid})
     MERGE (p:Passage {id: r.id}) SET p.text = r.text, p.idx = r.idx
     MERGE (p)-[:PART_OF]->(s)`,
    { sid: sourceId, rows: chunks.map((text, idx) => ({ id: passageIds[idx], text, idx })) },
  );

  // Mention tagging (entities by alias) — reuse simple contains against known entities.
  const entities = await g.ro<{ id: string; name: string; aliases: string[] }>(
    "MATCH (e:Entity) RETURN e.id AS id, e.name AS name, e.aliases AS aliases",
  );
  const mentions: { p: string; e: string }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const lower = chunks[i].toLowerCase();
    for (const e of entities) {
      const aliases = [e.name, ...(e.aliases ?? [])].map((a) => a.toLowerCase()).sort((a, b) => b.length - a.length);
      if (aliases.some((a) => a.length >= 2 && lower.includes(a))) mentions.push({ p: passageIds[i], e: e.id });
    }
  }
  if (mentions.length) {
    await g.query(
      "UNWIND $rows AS r MATCH (p:Passage {id: r.p}), (e:Entity {id: r.e}) MERGE (p)-[:MENTIONS]->(e)",
      { rows: mentions },
    );
  }

  let proposalId: string | null = null;
  const lower = body.toLowerCase();
  const looksLikeSignedUrls =
    lower.includes("signed") &&
    (lower.includes("cloudfront") || lower.includes("expire") || lower.includes("public link"));

  if (looksLikeSignedUrls) {
    // Prefer a passage that mentions signed URLs for citations.
    const signedPassage =
      passageIds.find((pid, i) => chunks[i].toLowerCase().includes("signed")) ?? passageIds[0];
    const payload: DecisionProposalPayload = {
      kind: "decision",
      title: "Signed URLs for lookbook video",
      statement:
        "Lookbook video is delivered through CloudFront signed URLs that expire after 1 hour. The originals stay in Amazon S3; only delivery changes.",
      chose: ["cloudfront"],
      rejected: [],
      about: ["cloudfront", "s3"],
      project: "storefront",
      decided_by: "omar",
      approved_by: null,
      supersedes: "D-07",
      partial: true,
      source_id: sourceId,
      reasons: [
        {
          kind: "cost",
          text: "Signed, expiring links end hotlink-driven bandwidth bills, and CloudFront egress stays a fraction of direct S3 egress.",
          passages: [signedPassage],
        },
        {
          kind: "other",
          text: "Only delivery changes; originals stay in the same S3 bucket, so nothing migrates.",
          passages: [signedPassage],
        },
      ],
    };
    // Only propose if D-07 still exists and is not already superseded.
    const [d07] = await g.ro<{ status: string }>("MATCH (d:Decision {id: 'D-07'}) RETURN d.status AS status");
    if (d07 && d07.status === "accepted") {
      proposalId = await createProposal(g, payload, author);
    }
  }

  // If no signed-URL decision proposal was created (pattern mismatch, or D-07
  // missing/already superseded), open a generic reviewable memory proposal.
  if (proposalId === null) {
    const firstChunk = chunks.length ? chunks[0] : body.replace(/\s+/g, " ").trim();
    const memPayload: MemoryProposalPayload = {
      kind: "memory",
      text: (input.title + ": " + firstChunk).slice(0, 280),
      type: "semantic",
      epistemic: "observation",
      sources: [sourceId],
      written_by: author,
    };
    proposalId = await createProposal(g, memPayload, author);
  }

  return { sourceId, passageIds, proposalId };
}

/** Seed a few demo memories onto an already-seeded demo graph (idempotent by text+type). */
export async function seedDemoMemories(g: TenantGraph): Promise<string[]> {
  const specs: Array<{
    text: string;
    type: MemoryType;
    sources: string[];
    writtenBy: string;
    validFrom: string;
    mentions?: string[];
    scopeProject?: string;
  }> = [
    {
      text: "S3 bucket for media originals is media-originals-prod.",
      type: "semantic",
      sources: ["S-11"],
      writtenBy: "scribe",
      validFrom: "2026-08-12T10:05:00+05:30",
      mentions: ["s3"],
      scopeProject: "storefront",
    },
    {
      text: "MySQL volume is small; do not put media bytes in BLOB columns.",
      type: "semantic",
      sources: ["S-09"],
      writtenBy: "scribe",
      validFrom: "2026-08-12T10:06:00+05:30",
      mentions: ["mysql"],
      scopeProject: "storefront",
    },
  ];
  const ids: string[] = [];
  for (const s of specs) {
    const existing = await g.ro<{ id: string }>(
      "MATCH (m:Memory {text: $text, type: $type}) RETURN m.id AS id LIMIT 1",
      { text: s.text, type: s.type },
    );
    if (existing.length) {
      ids.push(existing[0].id);
      continue;
    }
    const { memoryId } = await remember(g, {
      text: s.text,
      type: s.type,
      sources: s.sources,
      writtenBy: s.writtenBy,
      validFrom: Date.parse(s.validFrom),
      mentions: s.mentions,
      scopeProject: s.scopeProject,
    });
    if (memoryId) ids.push(memoryId);
  }
  return ids;
}

export { INF as MEMORY_INF };
