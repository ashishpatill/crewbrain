import { ask } from "@crewbrain/graph";
import { openTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "").trim();
    if (!question) return Response.json({ error: "question required" }, { status: 400 });
    const asOf = body.asOf != null ? Number(body.asOf) : undefined;
    if (asOf != null && Number.isNaN(asOf)) return Response.json({ error: "bad asOf" }, { status: 400 });
    const g = await openTenant(body.tenant);
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });
    const result = await ask(g, question, { asOf, store: body.store !== false, askedBy: body.askedBy ?? "web" });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
