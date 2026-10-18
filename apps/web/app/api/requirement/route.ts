import { runRequirement } from "@crewbrain/graph";
import { openTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = String(body.text ?? "").trim();
    if (!text) return Response.json({ error: "text required" }, { status: 400 });
    const g = await openTenant(body.tenant);
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });
    const result = await runRequirement(g, { text, actor: body.actor });
    return Response.json({ graph: g.key, ...result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
