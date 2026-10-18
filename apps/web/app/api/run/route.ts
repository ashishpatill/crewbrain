import { createRun, ingestIntoRun, decideInRun, getRun, getLatestRun } from "@crewbrain/graph";
import { openTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenant = url.searchParams.get("tenant");
    const g = await openTenant(tenant);
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });
    const runId = url.searchParams.get("runId");
    const run = runId ? await getRun(g, runId) : await getLatestRun(g);
    return Response.json({ graph: g.key, run });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const g = await openTenant(body.tenant);
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });
    const action = String(body.action ?? "create");

    if (action === "create") {
      const text = String(body.text ?? "").trim();
      if (!text) return Response.json({ error: "text required" }, { status: 400 });
      const run = await createRun(g, {
        text,
        actor: body.actor,
        source: body.source,
      });
      return Response.json({ graph: g.key, run });
    }

    if (action === "ingest") {
      const runId = String(body.runId ?? "");
      if (!runId) return Response.json({ error: "runId required" }, { status: 400 });
      const doc = body.doc ?? {
        text: body.text,
        title: body.title,
        kind: body.kind,
        author: body.author,
      };
      if (!doc?.text || !doc?.title) return Response.json({ error: "text and title required" }, { status: 400 });
      const run = await ingestIntoRun(g, runId, doc);
      return Response.json({ graph: g.key, run });
    }

    if (action === "decide") {
      const runId = String(body.runId ?? "");
      const proposalId = String(body.proposalId ?? "");
      const actor = String(body.actor ?? "");
      const da = (body.decision ?? body.decisionAction ?? body.proposalAction) as "approve" | "reject";
      if (!runId || !proposalId || !actor || !["approve", "reject"].includes(da)) {
        return Response.json({ error: "runId, proposalId, actor and decisionAction (approve|reject) required" }, { status: 400 });
      }
      const run = await decideInRun(g, runId, { proposalId, actor, action: da });
      return Response.json({ graph: g.key, run });
    }

    return Response.json({ error: `unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}