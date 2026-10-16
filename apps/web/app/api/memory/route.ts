import { graphMemory } from "@crewbrain/graph";
import { graphKeyFor } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

/** Memory meter: GRAPH.MEMORY USAGE for one tenant graph. */
export async function GET(req: Request) {
  try {
    const key = await graphKeyFor(new URL(req.url).searchParams.get("tenant"));
    const m = await graphMemory(key);
    return Response.json({ graph: m.graph, total_mb: m.total_mb, nodes: m.nodes, edges: m.edges });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
