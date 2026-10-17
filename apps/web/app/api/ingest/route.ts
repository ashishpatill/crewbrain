import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestDocument } from "@crewbrain/graph";
import { openTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

/** Return the hand-written sample chat (no LLM). */
export async function GET() {
  try {
    // From apps/web → repo root seed/
    const path = join(process.cwd(), "..", "..", "seed", "demo-ingest", "r2-chat.md");
    const raw = readFileSync(path, "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const meta: Record<string, string> = {};
    if (m) {
      for (const line of m[1].split("\n")) {
        const i = line.indexOf(":");
        if (i < 0) continue;
        meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
      }
    }
    return Response.json({
      title: meta.title ?? "#infra · signed URLs for lookbook video",
      kind: meta.kind ?? "chat",
      author: meta.author ?? "ravi",
      created_at: meta.created_at ?? null,
      text: (m ? m[2] : raw).trim(),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = String(body.text ?? "").trim();
    const title = String(body.title ?? "ingested document").trim();
    if (!text) return Response.json({ error: "text required" }, { status: 400 });
    const g = await openTenant(body.tenant);
    if (!(await g.exists())) return Response.json({ error: `tenant graph missing: ${g.key}` }, { status: 404 });
    const result = await ingestDocument(g, {
      text,
      title,
      kind: body.kind,
      author: body.author,
      createdAt: body.createdAt != null ? Number(body.createdAt) : undefined,
    });
    return Response.json({ graph: g.key, ...result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
