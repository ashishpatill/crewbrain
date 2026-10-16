import { openTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    const g = await openTenant(url.searchParams.get("tenant"));
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });

    const [source] = await g.ro<{
      id: string; kind: string; title: string; author: string; createdAt: number; url: string;
    }>(
      `MATCH (s:Source {id: $id})
       RETURN s.id AS id, s.kind AS kind, s.title AS title, s.author_ref AS author, s.created_at AS createdAt, s.url AS url`,
      { id },
    );
    if (source) {
      const passages = await g.ro<{ id: string; idx: number; text: string }>(
        "MATCH (p:Passage)-[:PART_OF]->(s:Source {id: $id}) RETURN p.id AS id, p.idx AS idx, p.text AS text ORDER BY p.idx",
        { id },
      );
      return Response.json({ type: "source", ...source, passages });
    }

    const [passage] = await g.ro<{
      id: string; text: string; idx: number; sourceId: string; sourceTitle: string; sourceKind: string;
    }>(
      `MATCH (p:Passage {id: $id})-[:PART_OF]->(s:Source)
       RETURN p.id AS id, p.text AS text, p.idx AS idx, s.id AS sourceId, s.title AS sourceTitle, s.kind AS sourceKind`,
      { id },
    );
    if (passage) return Response.json({ type: "passage", ...passage });

    return Response.json({ error: "not found" }, { status: 404 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
