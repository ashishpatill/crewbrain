import { randomUUID } from "node:crypto";
import type { TenantGraph } from "./tenant";
import { runRequirement, type RequirementResult, type RequirementStage } from "./requirement";
import { ask, type AskResult, type Citation } from "./trace";
import { ingestDocument } from "./memory";
import { listProposals, decideProposal, type ProposalRecord } from "./memory";
import { getTask, type TaskRecord } from "./coordination";

export interface RunStage {
  key: string;
  label: string;
  state: "done" | "stopped" | "skipped" | "pending";
  detail: string;
  href?: string;
}

export interface RunCitation {
  n: number;
  passageId: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: string;
  text: string;
}

export interface RunProposalRef {
  id: string;
  kind: string;
  status: string;
}

export interface RunTaskRef {
  id: string;
  status: string;
  claimedBy: string | null;
}

export interface RunRecord {
  id: string;
  text: string;
  actor: string | null;
  outcome: string;
  stages: RunStage[];
  taskId: string | null;
  task: RunTaskRef | null;
  proposalIds: string[];
  proposals: RunProposalRef[];
  sourceIds: string[];
  answer: string | null;
  answerAbstained: boolean | null;
  citations: RunCitation[];
  decisionId: string | null;
  decisionTitle: string | null;
  reaskAnswer: string | null;
  reaskAbstained: boolean | null;
  reaskCitations: RunCitation[];
  reaskDecisionId: string | null;
  createdAt: number;
  updatedAt: number;
  nextAction: { label: string; href?: string };
}

export type RunLike = Partial<RunRecord> & { text: string; outcome: string };

function newId() {
  return `run-${randomUUID().slice(0, 8)}`;
}

function toCitations(cs: Citation[] | undefined): RunCitation[] {
  return (cs ?? []).map((c) => ({
    n: c.n,
    passageId: c.passageId,
    sourceId: c.sourceId,
    sourceTitle: c.sourceTitle,
    sourceKind: c.sourceKind,
    text: c.text,
  }));
}

function stageFromRequirement(s: RequirementStage): RunStage {
  return { key: s.key, label: s.label, state: s.state as RunStage["state"], detail: s.detail };
}

async function persistRun(g: TenantGraph, data: {
  id: string; text: string; actor: string | null; outcome: string; stages: RunStage[];
  taskId: string | null; proposalIds: string[]; sourceIds: string[];
  answer: string | null; answerAbstained: boolean | null; citations: RunCitation[];
  decisionId: string | null; decisionTitle: string | null;
  reaskAnswer: string | null; reaskAbstained: boolean | null; reaskCitations: RunCitation[];
  reaskDecisionId: string | null; createdAt: number; updatedAt: number;
}): Promise<void> {
  await g.query(
    `CREATE (r:Run {
      id: $id, text: $text, actor: $actor, outcome: $outcome,
      stages_json: $stages_json, task_id: $task_id, proposal_ids_json: $proposal_ids_json,
      source_ids_json: $source_ids_json, answer: $answer, answer_abstained: $answer_abstained,
      citations_json: $citations_json, decision_id: $decision_id, decision_title: $decision_title,
      reask_answer: $reask_answer, reask_abstained: $reask_abstained, reask_citations_json: $reask_citations_json,
      reask_decision_id: $reask_decision_id, created_at: $created_at, updated_at: $updated_at
    })`,
    {
      id: data.id,
      text: data.text,
      actor: data.actor,
      outcome: data.outcome,
      stages_json: JSON.stringify(data.stages),
      task_id: data.taskId,
      proposal_ids_json: JSON.stringify(data.proposalIds),
      source_ids_json: JSON.stringify(data.sourceIds),
      answer: data.answer,
      answer_abstained: data.answerAbstained === null ? null : (data.answerAbstained ? "true" : "false"),
      citations_json: JSON.stringify(data.citations),
      decision_id: data.decisionId,
      decision_title: data.decisionTitle,
      reask_answer: data.reaskAnswer,
      reask_abstained: data.reaskAbstained === null ? null : (data.reaskAbstained ? "true" : "false"),
      reask_citations_json: JSON.stringify(data.reaskCitations),
      reask_decision_id: data.reaskDecisionId,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    },
  );
}

async function updateRun(g: TenantGraph, id: string, patch: Partial<{
  outcome: string; stages: RunStage[]; taskId: string | null; proposalIds: string[]; sourceIds: string[];
  answer: string | null; answerAbstained: boolean | null; citations: RunCitation[];
  decisionId: string | null; decisionTitle: string | null;
  reaskAnswer: string | null; reaskAbstained: boolean | null; reaskCitations: RunCitation[];
  reaskDecisionId: string | null; updatedAt: number;
}>): Promise<void> {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  if (patch.outcome !== undefined) { sets.push("r.outcome = $outcome"); params.outcome = patch.outcome; }
  if (patch.stages !== undefined) { sets.push("r.stages_json = $stages_json"); params.stages_json = JSON.stringify(patch.stages); }
  if (patch.taskId !== undefined) { sets.push("r.task_id = $task_id"); params.task_id = patch.taskId; }
  if (patch.proposalIds !== undefined) { sets.push("r.proposal_ids_json = $proposal_ids_json"); params.proposal_ids_json = JSON.stringify(patch.proposalIds); }
  if (patch.sourceIds !== undefined) { sets.push("r.source_ids_json = $source_ids_json"); params.source_ids_json = JSON.stringify(patch.sourceIds); }
  if (patch.answer !== undefined) { sets.push("r.answer = $answer"); params.answer = patch.answer; }
  if (patch.answerAbstained !== undefined) { sets.push("r.answer_abstained = $answer_abstained"); params.answer_abstained = patch.answerAbstained === null ? null : (patch.answerAbstained ? "true" : "false"); }
  if (patch.citations !== undefined) { sets.push("r.citations_json = $citations_json"); params.citations_json = JSON.stringify(patch.citations); }
  if (patch.decisionId !== undefined) { sets.push("r.decision_id = $decision_id"); params.decision_id = patch.decisionId; }
  if (patch.decisionTitle !== undefined) { sets.push("r.decision_title = $decision_title"); params.decision_title = patch.decisionTitle; }
  if (patch.reaskAnswer !== undefined) { sets.push("r.reask_answer = $reask_answer"); params.reask_answer = patch.reaskAnswer; }
  if (patch.reaskAbstained !== undefined) { sets.push("r.reask_abstained = $reask_abstained"); params.reask_abstained = patch.reaskAbstained === null ? null : (patch.reaskAbstained ? "true" : "false"); }
  if (patch.reaskCitations !== undefined) { sets.push("r.reask_citations_json = $reask_citations_json"); params.reask_citations_json = JSON.stringify(patch.reaskCitations); }
  if (patch.reaskDecisionId !== undefined) { sets.push("r.reask_decision_id = $reask_decision_id"); params.reask_decision_id = patch.reaskDecisionId; }
  const updatedAt = patch.updatedAt ?? Date.now();
  params.updated_at = updatedAt;
  sets.push("r.updated_at = $updated_at");
  if (sets.length === 0) return;
  await g.query(`MATCH (r:Run {id: $id}) SET ${sets.join(", ")}`, params);
}

export async function createRun(
  g: TenantGraph,
  input: { text: string; actor?: string; source?: { text: string; title: string; kind?: string; author?: string } },
): Promise<RunRecord> {
  const text = (input.text ?? "").trim();
  if (!text) throw new Error("text required");
  const now = Date.now();
  const id = newId();
  const reqResult: RequirementResult = await runRequirement(g, { text, actor: input.actor });

  const stages: RunStage[] = reqResult.stages.map(stageFromRequirement);
  let outcome = reqResult.outcome;
  const taskId = reqResult.task?.id ?? null;
  let proposalIds = reqResult.pendingProposals.map((p) => p.id);
  const sourceIds: string[] = [];
  const answer = reqResult.ask?.answer ?? null;
  const answerAbstained = reqResult.ask ? reqResult.ask.abstained : null;
  const citations = toCitations(reqResult.ask?.citations);
  const decisionId = reqResult.ask?.decision?.id ?? null;
  const decisionTitle = reqResult.ask?.decision?.title ?? null;

  if (input.source && outcome !== "answered") {
    try {
      const doc = await ingestDocument(g, {
        text: input.source.text,
        title: input.source.title,
        kind: input.source.kind,
        author: input.source.author,
      });
      sourceIds.push(doc.sourceId);
      stages.push({ key: "ingest", label: "Ingest source", state: "done", detail: `${doc.sourceId}` });
      stages.push({ key: "passages", label: "Source passages", state: "done", detail: `${doc.passageIds.length} passages` });
      if (doc.proposalId) {
        proposalIds = Array.from(new Set([...proposalIds, doc.proposalId]));
        stages.push({ key: "proposal", label: "Proposal pending", state: "stopped", detail: `human must approve: ${doc.proposalId}` });
      } else {
        stages.push({ key: "proposal", label: "Proposal pending", state: "done", detail: "no proposal opened" });
      }
    } catch (e) {
      stages.push({ key: "ingest", label: "Ingest source", state: "stopped", detail: (e as Error).message });
    }
  } else if (input.source && outcome === "answered") {
    stages.push({ key: "ingest", label: "Ingest source", state: "skipped", detail: "not needed — requirement already answered; source ingest skipped" });
  }

  await persistRun(g, {
    id,
    text,
    actor: input.actor ?? null,
    outcome,
    stages,
    taskId,
    proposalIds,
    sourceIds,
    answer,
    answerAbstained,
    citations,
    decisionId,
    decisionTitle,
    reaskAnswer: null,
    reaskAbstained: null,
    reaskCitations: [],
    reaskDecisionId: null,
    createdAt: now,
    updatedAt: now,
  });

  return await getRun(g, id) as RunRecord;
}

export async function ingestIntoRun(
  g: TenantGraph,
  runId: string,
  doc: { text: string; title: string; kind?: string; author?: string },
): Promise<RunRecord> {
  const run = await getRun(g, runId);
  if (!run) throw new Error(`run not found: ${runId}`);
  const res = await ingestDocument(g, { text: doc.text, title: doc.title, kind: doc.kind, author: doc.author });
  const stages = [...run.stages];
  stages.push({ key: "ingest", label: "Ingest source", state: "done", detail: `${res.sourceId}` });
  stages.push({ key: "passages", label: "Source passages", state: "done", detail: `${res.passageIds.length} passages` });
  const proposalIds = res.proposalId
    ? Array.from(new Set([...run.proposalIds, res.proposalId]))
    : run.proposalIds;
  if (res.proposalId) {
    stages.push({ key: "proposal", label: "Proposal pending", state: "stopped", detail: `human must approve: ${res.proposalId}` });
  }
  const sourceIds = Array.from(new Set([...run.sourceIds, res.sourceId]));
  await updateRun(g, runId, { stages, sourceIds, proposalIds, updatedAt: Date.now() });
  return await getRun(g, runId) as RunRecord;
}

export async function decideInRun(
  g: TenantGraph,
  runId: string,
  input: { proposalId: string; actor: string; action: "approve" | "reject" },
): Promise<RunRecord> {
  const run = await getRun(g, runId);
  if (!run) throw new Error(`run not found: ${runId}`);
  // Person-only check stays inside decideProposal.
  await decideProposal(g, input.proposalId, { actor: input.actor, action: input.action });

  const stages = [...run.stages];
  let outcome = run.outcome;
  let reaskAnswer: string | null = run.reaskAnswer;
  let reaskAbstained: boolean | null = run.reaskAbstained;
  let reaskCitations: RunCitation[] = run.reaskCitations;
  let reaskDecisionId: string | null = run.reaskDecisionId;

  if (input.action === "approve") {
    const askResult: AskResult = await ask(g, run.text, { store: false });
    stages.push({ key: "reask", label: "Re-ask original requirement", state: "done", detail: askResult.abstained ? "still no recorded decision or source citations" : "answered from the graph" });
    reaskAnswer = askResult.answer;
    reaskAbstained = askResult.abstained;
    reaskCitations = toCitations(askResult.citations);
    reaskDecisionId = askResult.decision?.id ?? null;
    if (askResult.decision || askResult.citations.length > 0) {
      outcome = "answered_after_approval";
      stages.push({ key: "done", label: "Answered after approval", state: "done", detail: askResult.decision ? `decision ${askResult.decision.id}` : `source citations: ${askResult.citations.map((c) => c.passageId).join(", ")}` });
    } else {
      outcome = "approved_not_answered";
    }
  } else {
    outcome = "rejected";
    stages.push({ key: "rejected", label: "Proposal rejected", state: "stopped", detail: "Next: add a different source document" });
  }

  await updateRun(g, runId, {
    stages,
    outcome,
    reaskAnswer,
    reaskAbstained,
    reaskCitations,
    reaskDecisionId,
    updatedAt: Date.now(),
  });
  return await getRun(g, runId) as RunRecord;
}

export async function getRun(g: TenantGraph, id: string): Promise<RunRecord | null> {
  const rows = await g.ro<{
    id: string; text: string; actor: string | null; outcome: string;
    stages_json: string; task_id: string | null; proposal_ids_json: string; source_ids_json: string;
    answer: string | null; answer_abstained: string | null; citations_json: string;
    decision_id: string | null; decision_title: string | null;
    reask_answer: string | null; reask_abstained: string | null; reask_citations_json: string;
    reask_decision_id: string | null; created_at: number; updated_at: number;
  }>("MATCH (r:Run {id: $id}) RETURN r.id AS id, r.text AS text, r.actor AS actor, r.outcome AS outcome, r.stages_json AS stages_json, r.task_id AS task_id, r.proposal_ids_json AS proposal_ids_json, r.source_ids_json AS source_ids_json, r.answer AS answer, r.answer_abstained AS answer_abstained, r.citations_json AS citations_json, r.decision_id AS decision_id, r.decision_title AS decision_title, r.reask_answer AS reask_answer, r.reask_abstained AS reask_abstained, r.reask_citations_json AS reask_citations_json, r.reask_decision_id AS reask_decision_id, r.created_at AS created_at, r.updated_at AS updated_at", { id });
  if (!rows.length) return null;
  const row = rows[0];
  let stages: RunStage[] = [];
  try { stages = JSON.parse(row.stages_json || "[]"); } catch { stages = []; }
  let proposalIds: string[] = [];
  try { proposalIds = JSON.parse(row.proposal_ids_json || "[]"); } catch { proposalIds = []; }
  let sourceIds: string[] = [];
  try { sourceIds = JSON.parse(row.source_ids_json || "[]"); } catch { sourceIds = []; }
  let citations: RunCitation[] = [];
  try { citations = JSON.parse(row.citations_json || "[]"); } catch { citations = []; }
  let reaskCitations: RunCitation[] = [];
  try { reaskCitations = JSON.parse(row.reask_citations_json || "[]"); } catch { reaskCitations = []; }

  const allProposals = await listProposals(g);
  const proposals: RunProposalRef[] = proposalIds.map((pid) => {
    const p = allProposals.find((x) => x.id === pid);
    return { id: pid, kind: p?.kind ?? "unknown", status: p?.status ?? "unknown" };
  });

  let task: RunTaskRef | null = null;
  if (row.task_id) {
    const t: TaskRecord | null = await getTask(g, row.task_id);
    if (t) task = { id: t.id, status: t.status, claimedBy: t.claimedBy };
  }

  const run: RunRecord = {
    id: row.id,
    text: row.text,
    actor: row.actor,
    outcome: row.outcome,
    stages,
    taskId: row.task_id,
    task,
    proposalIds,
    proposals,
    sourceIds,
    answer: row.answer,
    answerAbstained: row.answer_abstained === "true" ? true : row.answer_abstained === "false" ? false : null,
    citations,
    decisionId: row.decision_id,
    decisionTitle: row.decision_title,
    reaskAnswer: row.reask_answer,
    reaskAbstained: row.reask_abstained === "true" ? true : row.reask_abstained === "false" ? false : null,
    reaskCitations,
    reaskDecisionId: row.reask_decision_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextAction: { label: "" },
  };
  run.nextAction = computeNextAction(run);
  return run;
}

export async function getLatestRun(g: TenantGraph): Promise<RunRecord | null> {
  const rows = await g.ro<{ id: string }>("MATCH (r:Run) RETURN r.id AS id ORDER BY r.created_at DESC LIMIT 1");
  if (!rows.length) return null;
  return await getRun(g, rows[0].id);
}

export function computeNextAction(run: any): { label: string; href?: string } {
  const outcome = String(run?.outcome ?? "");
  let proposals: Array<{ id: string; status: string }> = [];
  if (Array.isArray(run?.proposals)) proposals = run.proposals.map((p: any) => ({ id: p.id, status: p.status ?? "pending" }));
  else if (Array.isArray(run?.pendingProposals)) proposals = run.pendingProposals.map((p: any) => ({ id: p.id ?? p, status: p.status ?? "pending" }));
  let pending = proposals.filter((p) => (p.status ?? "pending") === "pending");
  if (!pending.length && Array.isArray(run?.pendingProposalIds)) {
    pending = run.pendingProposalIds.map((id: any) => ({ id, status: "pending" }));
  }
  // also if proposalIds + a statuses map? no
  const pendingId = pending[0]?.id;
  const sourceIds = Array.isArray(run?.sourceIds) ? run.sourceIds : (Array.isArray(run?.source_ids) ? run.source_ids : []);
  const taskStatus = run?.task?.status ?? run?.taskStatus ?? null;
  const reaskAbstained = run?.reaskAbstained === true || run?.reask_abstained === true;

  if (pending.length > 0 && pendingId) {
    return { label: `Next: approve or reject proposal ${pendingId}`, href: "/review" };
  }
  if (outcome === "rejected") {
    return { label: "Next: add a different source document", href: "/ingest" };
  }
  if (outcome === "approved_not_answered" || reaskAbstained) {
    return { label: "Next: add a source document that answers this", href: "/ingest" };
  }
  if (outcome === "task_created" || taskStatus === "todo") {
    return { label: "Next: claim the task on Agents", href: "/agents" };
  }
  if ((outcome === "task_claimed" || taskStatus === "claimed") && sourceIds.length === 0) {
    return { label: "Next: add a source document", href: "/ingest" };
  }
  if (outcome === "answered" || outcome === "answered_after_approval") {
    return { label: "Nothing needed — answered" };
  }
  if (outcome === "task_claimed") {
    return { label: "Next: add a source document", href: "/ingest" };
  }
  return { label: "Nothing needed — answered" };
}