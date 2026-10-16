import { listTimeline } from "@crewbrain/graph";
import { openTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const g = await openTenant(url.searchParams.get("tenant"));
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });
    const asOfRaw = url.searchParams.get("asOf");
    const asOf = asOfRaw ? Number(asOfRaw) : undefined;
    const type = (url.searchParams.get("type") as "all" | "decision" | "memory" | "source" | "proposal" | "episode" | "procedure" | null) ?? "all";
    const events = await listTimeline(g, {
      asOf: asOf && !Number.isNaN(asOf) ? asOf : undefined,
      projectId: url.searchParams.get("project") ?? undefined,
      agentId: url.searchParams.get("agent") ?? undefined,
      type: type === "all" ? "all" : type,
      limit: Number(url.searchParams.get("limit") ?? 80),
    });
    return Response.json({ graph: g.key, asOf: asOf ?? Date.now(), events });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
