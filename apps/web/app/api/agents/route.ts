import { contextCard, listHandoffs, listTasks, raceTest, runSignedUrlScenario } from "@crewbrain/graph";
import { openTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

const CREW = ["scribe", "researcher", "coder", "reviewer"];

export async function GET(req: Request) {
  try {
    const g = await openTenant(new URL(req.url).searchParams.get("tenant"));
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });
    const tasks = (await listTasks(g)).filter((t) => !t.id.startsWith("RACE-"));
    const handoffs = await listHandoffs(g);
    const agents = [];
    for (const a of CREW) {
      try {
        const c = await contextCard(g, a, { memoryLimit: 5 });
        agents.push({ id: a, role: c.agent.role, inbox: c.inbox.length, openTasks: c.openTasks.length, lastEpisode: c.lastEpisode?.summary ?? null });
      } catch {
        /* agent not in this tenant */
      }
    }
    return Response.json({ graph: g.key, agents, tasks, handoffs });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** body: { action: "scenario" | "race", tenant?, agents?, tasks? } */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const g = await openTenant(body.tenant);
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });
    if (body.action === "scenario") return Response.json(await runSignedUrlScenario(g));
    if (body.action === "race") {
      const agents = Math.min(16, Math.max(2, Number(body.agents ?? 8)));
      const tasks = Math.min(200, Math.max(10, Number(body.tasks ?? 50)));
      return Response.json(await raceTest(g, { agents, tasks }));
    }
    return Response.json({ error: "action must be scenario or race" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
