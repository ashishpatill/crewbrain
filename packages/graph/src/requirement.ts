import type { TenantGraph } from "./tenant";
import { ask, type AskResult } from "./trace";
import { createTask, claimTask, type TaskRecord } from "./coordination";
import { listProposals, type ProposalRecord } from "./memory";

export interface RequirementStage {
  key: string;
  label: string;
  state: "done" | "stopped" | "skipped";
  detail: string;
}

export interface RequirementResult {
  stages: RequirementStage[];
  ask?: AskResult;
  task?: TaskRecord;
  pendingProposals: Array<{ id: string; kind: string; status: string }>;
  outcome: "answered" | "task_claimed" | "task_created" | "needs_review";
}

export async function runRequirement(
  g: TenantGraph,
  input: { text: string; actor?: string },
): Promise<RequirementResult> {
  const text = (input.text ?? "").trim();
  if (!text) throw new Error("text required");

  const stages: RequirementStage[] = [];
  const pending = await listProposals(g, { status: "pending" });
  const pendingProposals = pending.map((p) => ({ id: p.id, kind: p.kind, status: p.status }));

  stages.push({ key: "received", label: "Received requirement", state: "done", detail: text.slice(0, 120) });

  const askResult = await ask(g, text, { store: false });
  const answered = !!askResult.decision || askResult.citations.length > 0;

  let outcome: RequirementResult["outcome"] = "task_created";
  let task: TaskRecord | undefined;

  if (answered) {
    const detail = askResult.decision
      ? `answered by decision ${askResult.decision.id}`
      : `source citations: ${askResult.citations.map((c) => c.passageId).join(", ")}`;
    stages.push({ key: "ask", label: "Ask (graph trace)", state: "done", detail });
    stages.push({ key: "task", label: "Create task", state: "skipped", detail: "not needed — question answered by the graph" });
    stages.push({ key: "claim", label: "Claim task", state: "skipped", detail: "not needed — question answered by the graph" });
    stages.push({ key: "execution", label: "Execution", state: "skipped", detail: "not needed — question answered by the graph" });
    outcome = "answered";
  } else {
    stages.push({ key: "ask", label: "Ask (graph trace)", state: "done", detail: "no recorded decision or source citations" });

    task = await createTask(g, { title: text.slice(0, 200), createdBy: input.actor });
    stages.push({ key: "task", label: "Create task", state: "done", detail: `${task.id} (${task.status})` });

    const agents = await g.ro<{ id: string }>("MATCH (a:Agent) RETURN a.id AS id ORDER BY a.id LIMIT 1");
    if (agents.length === 0) {
      stages.push({ key: "claim", label: "Claim task", state: "stopped", detail: "no agents in this tenant; task left todo — claim it manually on the Agents page" });
      stages.push({ key: "execution", label: "Execution", state: "skipped", detail: "no agent to claim the task" });
      outcome = "task_created";
    } else {
      const agentId = agents[0].id;
      const claimed = await claimTask(g, task.id, agentId, task.version);
      task = claimed;
      stages.push({ key: "claim", label: "Claim task", state: "done", detail: `${agentId} claimed ${task.id}` });
      stages.push({ key: "execution", label: "Execution", state: "stopped", detail: "no autonomous worker executes beyond claiming tonight; work continues manually / via handoff on the Agents page" });
      outcome = "task_claimed";
    }
  }

  // review stage always
  if (pending.length > 0) {
    const detail = `human must approve in Review: ${pending.map((p) => p.id).join(", ")}` +
      (answered ? " (noted; outcome stays answered)" : "");
    stages.push({ key: "review", label: "Review pending proposals", state: "stopped", detail });
  } else {
    stages.push({ key: "review", label: "Review pending proposals", state: "done", detail: "no pending proposals" });
  }

  const result: RequirementResult = {
    stages,
    ask: askResult,
    task,
    pendingProposals,
    outcome,
  };
  return result;
}
