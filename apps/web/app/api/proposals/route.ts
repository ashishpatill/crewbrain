import { listProposals, decideProposal } from "@crewbrain/graph";
import { openTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const g = await openTenant(url.searchParams.get("tenant"));
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });
    const status = url.searchParams.get("status") as "pending" | "approved" | "rejected" | "edited" | null;
    const proposals = await listProposals(g, { status: status ?? undefined });
    return Response.json({ graph: g.key, proposals });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const g = await openTenant(body.tenant);
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });
    const proposalId = String(body.proposalId ?? "");
    const actor = String(body.actor ?? "");
    const action = body.action as "approve" | "reject" | "edit";
    if (!proposalId || !actor || !["approve", "reject", "edit"].includes(action)) {
      return Response.json({ error: "proposalId, actor and action required" }, { status: 400 });
    }
    const result = await decideProposal(g, proposalId, {
      actor,
      action,
      editedPayload: body.editedPayload,
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
