import { health } from "@crewbrain/graph";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = await health();
  return Response.json({ service: "crewbrain", falkordb: h }, { status: h.ok ? 200 : 503 });
}
