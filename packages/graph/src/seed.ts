import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TenantGraph } from "./tenant";
import { migrate } from "./migrate";

export interface SeedSource {
  id: string;
  kind: string;
  title: string;
  author: string;
  created_at: number;
  hash: string;
  passages: { id: string; idx: number; text: string }[];
}

/** `---` front matter (flat key: value) followed by paragraphs. Each paragraph is one Passage. */
export function parseSource(raw: string): SeedSource {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("source is missing front matter");
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
  }
  for (const k of ["id", "kind", "title", "author", "created_at"]) if (!meta[k]) throw new Error(`source missing ${k}`);
  const body = m[2].trim();
  const num = meta.id.replace(/^S-/, "");
  const passages = body
    .split(/\n\s*\n/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text, idx) => ({ id: `P-${num}-${idx}`, idx, text }));
  const created = Date.parse(meta.created_at);
  if (Number.isNaN(created)) throw new Error(`bad created_at in ${meta.id}`);
  return {
    id: meta.id,
    kind: meta.kind,
    title: meta.title,
    author: meta.author,
    created_at: created,
    hash: createHash("sha256").update(body).digest("hex"),
    passages,
  };
}

export function loadCorpus(dir: string): SeedSource[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseSource(readFileSync(join(dir, f), "utf8")));
}

interface Entity { id: string; name: string; kind: string; aliases: string[]; owner?: string }
interface Reason { id: string; kind: string; text: string; passages: string[] }
interface DecisionSeed {
  id: string; title: string; statement: string; decided_at: string; about: string[]; project?: string;
  chose: string[]; rejected: { entity: string; reason: string }[]; decided_by: string;
  approved_by: string | null; recorded_in: string[]; reasons: Reason[];
}
export interface TenantSeed {
  tenant: { id: string; name: string; kind: string; graph: string };
  people: { id: string; name: string; role: string; handle: string }[];
  teams: { id: string; name: string; members: string[]; owns: string[] }[];
  projects: { id: string; name: string; status: string; owner: string; uses: string[] }[];
  agents: { id: string; name: string; role: string; host: string; model: string; operator: string; projects: string[] }[];
  entities: Entity[];
  decisions: DecisionSeed[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Alias matching, longest alias first, masking matched text so "Cloudflare R2" is not also "Cloudflare". */
export function findMentions(text: string, entities: Entity[]): string[] {
  const pairs = entities.flatMap((e) => e.aliases.map((a) => ({ id: e.id, a: a.toLowerCase() })));
  pairs.sort((x, y) => y.a.length - x.a.length);
  let t = text.toLowerCase();
  const found = new Set<string>();
  for (const { id, a } of pairs) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRe(a)}(?![a-z0-9])`, "g");
    if (re.test(t)) {
      found.add(id);
      t = t.replace(re, (s) => " ".repeat(s.length));
    }
  }
  return [...found];
}

export interface SeedReport { graph: string; sources: number; passages: number; decisions: number; reasons: number; mentions: number }

/** Idempotent seed: every write is a MERGE on id. `reset` drops the graph first. */
export async function seedTenant(seed: TenantSeed, corpus: SeedSource[], opts: { reset?: boolean; graphKey?: string; registryKey?: string } = {}): Promise<SeedReport> {
  const key = opts.graphKey ?? seed.tenant.graph;
  const g = await TenantGraph.open(key);
  if (opts.reset) await g.drop();
  await migrate(g);

  const passageIds = new Set(corpus.flatMap((s) => s.passages.map((p) => p.id)));
  const sourceIds = new Set(corpus.map((s) => s.id));
  for (const d of seed.decisions) {
    for (const r of d.reasons) for (const p of r.passages) if (!passageIds.has(p)) throw new Error(`${d.id}/${r.id}: unknown passage ${p}`);
    for (const s of d.recorded_in) if (!sourceIds.has(s)) throw new Error(`${d.id}: unknown source ${s}`);
  }

  await g.query("UNWIND $rows AS r MERGE (p:Person {id: r.id}) SET p.name = r.name, p.role = r.role, p.handle = r.handle", { rows: seed.people });
  await g.query(
    `UNWIND $rows AS r MERGE (p:Project {id: r.id}) SET p.name = r.name, p.status = r.status
     WITH p, r MATCH (o:Person {id: r.owner}) MERGE (o)-[:OWNS]->(p) MERGE (o)-[:WORKED_ON]->(p)`,
    { rows: seed.projects },
  );
  await g.query(
    `UNWIND $rows AS r MERGE (t:Team {id: r.id}) SET t.name = r.name
     WITH t, r UNWIND r.members AS m MATCH (p:Person {id: m}) MERGE (p)-[:MEMBER_OF]->(t)`,
    { rows: seed.teams },
  );
  await g.query(
    "UNWIND $rows AS r UNWIND r.owns AS o MATCH (t:Team {id: r.id}), (p:Project {id: o}) MERGE (t)-[:OWNS]->(p)",
    { rows: seed.teams },
  );
  await g.query(
    `UNWIND $rows AS r MERGE (e:Entity {id: r.id}) SET e.name = r.name, e.kind = r.kind, e.aliases = r.aliases
     WITH e, r WHERE r.owner IS NOT NULL MATCH (o:Person {id: r.owner}) MERGE (o)-[:OWNS]->(e)`,
    { rows: seed.entities.map((e) => ({ ...e, owner: e.owner ?? null })) },
  );
  await g.query(
    "UNWIND $rows AS r UNWIND r.uses AS u MATCH (p:Project {id: r.id}), (e:Entity {id: u}) MERGE (p)-[:USES]->(e)",
    { rows: seed.projects },
  );
  await g.query(
    `UNWIND $rows AS r MERGE (a:Agent {id: r.id}) SET a.name = r.name, a.role = r.role, a.host = r.host, a.model = r.model, a.status = 'idle'
     WITH a, r MATCH (o:Person {id: r.operator}) MERGE (a)-[:OPERATED_BY]->(o)
     WITH a, r UNWIND r.projects AS pr MATCH (p:Project {id: pr}) MERGE (a)-[:WORKS_ON]->(p)`,
    { rows: seed.agents },
  );

  // Sources and passages.
  await g.query(
    `UNWIND $rows AS r MERGE (s:Source {id: r.id})
     SET s.kind = r.kind, s.title = r.title, s.author_ref = r.author, s.created_at = r.created_at, s.hash = r.hash, s.url = 'seed://acme/' + r.id
     WITH s, r OPTIONAL MATCH (p:Person {id: r.author}) OPTIONAL MATCH (a:Agent {id: r.author})
     FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | MERGE (s)-[:AUTHORED_BY]->(p))
     FOREACH (_ IN CASE WHEN a IS NULL THEN [] ELSE [1] END | MERGE (s)-[:AUTHORED_BY]->(a))`,
    { rows: corpus.map(({ passages, ...s }) => s) },
  );
  const passages = corpus.flatMap((s) => s.passages.map((p) => ({ ...p, source: s.id })));
  await g.query(
    `UNWIND $rows AS r MATCH (s:Source {id: r.source}) MERGE (p:Passage {id: r.id})
     SET p.text = r.text, p.idx = r.idx MERGE (p)-[:PART_OF]->(s)`,
    { rows: passages },
  );

  // Mentions (entities by alias, people by name).
  const people = seed.people.map((p) => ({ id: p.id, name: p.name, kind: "person", aliases: [p.name] }));
  const entMentions: { p: string; e: string }[] = [];
  const personMentions: { p: string; e: string }[] = [];
  for (const p of passages) {
    for (const e of findMentions(p.text, seed.entities)) entMentions.push({ p: p.id, e });
    for (const e of findMentions(p.text, people)) personMentions.push({ p: p.id, e });
  }
  await g.query("UNWIND $rows AS r MATCH (p:Passage {id: r.p}), (e:Entity {id: r.e}) MERGE (p)-[:MENTIONS]->(e)", { rows: entMentions });
  await g.query("UNWIND $rows AS r MATCH (p:Passage {id: r.p}), (e:Person {id: r.e}) MERGE (p)-[:MENTIONS]->(e)", { rows: personMentions });

  // Hand-authored decisions.
  const now = Date.now();
  for (const d of seed.decisions) {
    const at = Date.parse(d.decided_at);
    await g.query(
      `MERGE (d:Decision {id: $id})
       SET d.title = $title, d.statement = $statement, d.status = 'accepted', d.decided_at = $at,
           d.valid_from = $at, d.recorded_at = $recorded, d.confidence = 1.0`,
      { id: d.id, title: d.title, statement: d.statement, at, recorded: now },
    );
    await g.query("MATCH (d:Decision {id: $id}) UNWIND $ids AS e MATCH (x:Entity {id: e}) MERGE (d)-[:ABOUT]->(x)", { id: d.id, ids: d.about });
    if (d.project) await g.query("MATCH (d:Decision {id: $id}), (p:Project {id: $p}) MERGE (d)-[:ABOUT]->(p)", { id: d.id, p: d.project });
    await g.query("MATCH (d:Decision {id: $id}) UNWIND $ids AS e MATCH (x:Entity {id: e}) MERGE (d)-[:CHOSE]->(x)", { id: d.id, ids: d.chose });
    await g.query(
      "MATCH (d:Decision {id: $id}) UNWIND $rows AS r MATCH (x:Entity {id: r.entity}) MERGE (d)-[j:REJECTED]->(x) SET j.reason = r.reason",
      { id: d.id, rows: d.rejected },
    );
    await g.query("MATCH (d:Decision {id: $id}), (p:Person {id: $p}) MERGE (d)-[:DECIDED_BY]->(p)", { id: d.id, p: d.decided_by });
    if (d.approved_by) await g.query("MATCH (d:Decision {id: $id}), (p:Person {id: $p}) MERGE (d)-[:APPROVED_BY]->(p)", { id: d.id, p: d.approved_by });
    await g.query("MATCH (d:Decision {id: $id}) UNWIND $ids AS s MATCH (x:Source {id: s}) MERGE (d)-[:RECORDED_IN]->(x)", { id: d.id, ids: d.recorded_in });
    await g.query(
      `MATCH (d:Decision {id: $id}) UNWIND $rows AS r
       MERGE (x:Reason {id: r.id}) SET x.text = r.text, x.kind = r.kind MERGE (d)-[:BECAUSE]->(x)
       WITH x, r UNWIND range(0, size(r.passages) - 1) AS i MATCH (p:Passage {id: r.passages[i]})
       MERGE (x)-[s:SUPPORTED_BY]->(p) SET s.rank = i`,
      { id: d.id, rows: d.reasons },
    );
  }

  // Registry entry lives in its own graph, holding no tenant data.
  const reg = await TenantGraph.open(opts.registryKey ?? "t_registry");
  await migrate(reg);
  await reg.query(
    "MERGE (t:Tenant {id: $id}) ON CREATE SET t.created_at = $now SET t.name = $name, t.kind = $kind, t.graph = $graph",
    { ...seed.tenant, graph: key, now },
  );

  return {
    graph: key,
    sources: corpus.length,
    passages: passages.length,
    decisions: seed.decisions.length,
    reasons: seed.decisions.reduce((n, d) => n + d.reasons.length, 0),
    mentions: entMentions.length + personMentions.length,
  };
}
