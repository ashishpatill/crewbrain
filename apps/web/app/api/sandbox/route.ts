import { SANDBOX_CAP, SandboxCapError, cleanupExpiredSandboxes, createSandbox, graphMemory, listSandboxes } from "@crewbrain/graph";

export const dynamic = "force-dynamic";

export async function GET() {
  await cleanupExpiredSandboxes();
  const list = await listSandboxes();
  const rows = await Promise.all(list.map(async (s) => ({ ...s, memory: await graphMemory(s.graph) })));
  return Response.json({ cap: SANDBOX_CAP, sandboxes: rows.map(({ memory, ...s }) => ({ ...s, total_mb: memory.total_mb, nodes: memory.nodes, edges: memory.edges })) });
}

export async function POST() {
  try {
    return Response.json(await createSandbox(), { status: 201 });
  } catch (e) {
    const status = e instanceof SandboxCapError ? 429 : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
