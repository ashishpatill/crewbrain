import { openTenant } from "../../../../lib/tenant";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY one-off maintenance endpoint (removed in the follow-up commit).
 * Hardcoded, parameter-free: rename Person omar -> ashish in t_acme only,
 * in place (edges preserved), merging into an existing ashish if present,
 * then sweep every string property (nodes + relationships) for Omar/omar.
 * GET = read-only inspection. POST = apply. No proposal is ever decided here.
 */

type Props = Record<string, unknown>;
const OLD_ID = "omar";
const NEW_ID = "ashish";
const KEY_OK = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TYPE_OK = /^[A-Z_][A-Z0-9_]*$/;

function fixText(v: string): string {
  return v.replace(/Omar/g, "Ashish").replace(/OMAR/g, "ASHISH").replace(/omar/g, "ashish");
}
function hasOmar(v: unknown): v is string {
  return typeof v === "string" && /omar/i.test(v);
}

async function scan(g: Awaited<ReturnType<typeof openTenant>>) {
  const persons = await g.ro<{ id: string; name: string; handle: string | null; role: string | null }>(
    "MATCH (p:Person) RETURN p.id AS id, p.name AS name, p.handle AS handle, p.role AS role ORDER BY p.id",
  );
  const nodes = await g.ro<{ _id: number; labels: string[]; props: Props }>(
    "MATCH (n) RETURN ID(n) AS _id, labels(n) AS labels, properties(n) AS props",
  );
  const rels = await g.ro<{ _id: number; type: string; props: Props }>(
    "MATCH ()-[r]->() RETURN ID(r) AS _id, type(r) AS type, properties(r) AS props",
  );
  const nodeHits: { label: string; nodeId: unknown; keys: string[] }[] = [];
  let nodeOcc = 0;
  for (const n of nodes) {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(n.props ?? {})) {
      if (hasOmar(v)) { keys.push(k); nodeOcc += (v.match(/omar/gi) ?? []).length; }
    }
    if (keys.length) nodeHits.push({ label: (n.labels ?? [])[0] ?? "?", nodeId: (n.props as Props)?.id ?? n._id, keys });
  }
  const relHits: { type: string; keys: string[] }[] = [];
  let relOcc = 0;
  for (const r of rels) {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(r.props ?? {})) {
      if (hasOmar(v)) { keys.push(k); relOcc += (v.match(/omar/gi) ?? []).length; }
    }
    if (keys.length) relHits.push({ type: r.type, keys });
  }
  const edges = await g.ro<{ dir: string; type: string; other: string; n: number }>(
    `MATCH (p:Person)-[r]->(o) WHERE p.id IN [$o1, $o2]
     RETURN 'out' AS dir, type(r) AS type, coalesce(o.id, '?') AS other, count(*) AS n
     UNION ALL
     MATCH (o)-[r]->(p:Person) WHERE p.id IN [$o1, $o2]
     RETURN 'in' AS dir, type(r) AS type, coalesce(o.id, '?') AS other, count(*) AS n`,
    { o1: OLD_ID, o2: NEW_ID },
  ).catch(() => []);
  return {
    graph: g.key,
    persons,
    nodeCount: nodes.length,
    relCount: rels.length,
    omarOccurrences: { nodes: nodeOcc, relationships: relOcc, total: nodeOcc + relOcc },
    nodeHits,
    relHits,
    personEdges: edges,
  };
}

export async function GET() {
  try {
    const g = await openTenant("acme");
    return Response.json({ mode: "inspect", ...(await scan(g)) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const g = await openTenant("acme");
    const before = await scan(g);
    const touched: string[] = [];

    const hasOld = before.persons.some((p) => p.id === OLD_ID);
    const hasNew = before.persons.some((p) => p.id === NEW_ID);

    if (hasOld && !hasNew) {
      // In-place rename: same node, every edge (DECIDED_BY, APPROVED_BY, OWNS,
      // WORKED_ON, MEMBER_OF, OPERATED_BY, AUTHORED_BY, MENTIONS, ...) preserved.
      await g.query(
        "MATCH (p:Person {id: $old}) SET p.id = $new, p.name = 'Ashish', p.handle = '@ashish'",
        { old: OLD_ID, new: NEW_ID },
      );
      touched.push("Person omar renamed in place to ashish (id/name/handle); all edges kept on the same node");
    } else if (hasOld && hasNew) {
      // Merge: re-point every incident edge to the existing ashish, then delete omar.
      const incoming = await g.ro<{ aid: number; type: string; props: Props }>(
        "MATCH (a)-[r]->(p:Person {id: $old}) RETURN ID(a) AS aid, type(r) AS type, properties(r) AS props",
        { old: OLD_ID },
      );
      const outgoing = await g.ro<{ bid: number; type: string; props: Props }>(
        "MATCH (p:Person {id: $old})-[r]->(b) RETURN ID(b) AS bid, type(r) AS type, properties(r) AS props",
        { old: OLD_ID },
      );
      for (const e of incoming) {
        if (!TYPE_OK.test(e.type)) throw new Error(`unexpected rel type ${e.type}`);
        await g.query(
          `MATCH (a) WHERE ID(a) = $aid MATCH (b:Person {id: $new}) MERGE (a)-[r:${e.type}]->(b)`,
          { aid: e.aid, new: NEW_ID },
        );
        for (const [k, v] of Object.entries(e.props ?? {})) {
          if (!KEY_OK.test(k)) continue;
          await g.query(`MATCH (a) WHERE ID(a) = $aid MATCH (b:Person {id: $new}) MATCH (a)-[r:${e.type}]->(b) SET r.\`${k}\` = $v`, { aid: e.aid, new: NEW_ID, v });
        }
      }
      for (const e of outgoing) {
        if (!TYPE_OK.test(e.type)) throw new Error(`unexpected rel type ${e.type}`);
        await g.query(
          `MATCH (b) WHERE ID(b) = $bid MATCH (a:Person {id: $new}) MERGE (a)-[r:${e.type}]->(b)`,
          { bid: e.bid, new: NEW_ID },
        );
        for (const [k, v] of Object.entries(e.props ?? {})) {
          if (!KEY_OK.test(k)) continue;
          await g.query(`MATCH (b) WHERE ID(b) = $bid MATCH (a:Person {id: $new}) MATCH (a)-[r:${e.type}]->(b) SET r.\`${k}\` = $v`, { bid: e.bid, new: NEW_ID, v });
        }
      }
      await g.query("MATCH (p:Person {id: $old}) DETACH DELETE p", { old: OLD_ID });
      touched.push(`Person omar merged into existing ashish: ${incoming.length} incoming + ${outgoing.length} outgoing edges re-pointed, omar node deleted`);
    }

    // String sweep over every node + relationship property.
    const nodes = await g.query<{ _id: number; labels: string[]; props: Props }>(
      "MATCH (n) RETURN ID(n) AS _id, labels(n) AS labels, properties(n) AS props",
    );
    let nodePropsFixed = 0;
    for (const n of nodes) {
      for (const [k, v] of Object.entries(n.props ?? {})) {
        if (!hasOmar(v) || !KEY_OK.test(k)) continue;
        await g.query(`MATCH (n) WHERE ID(n) = $_id SET n.\`${k}\` = $v`, { _id: n._id, v: fixText(v) });
        nodePropsFixed++;
        touched.push(`node ${(n.labels ?? [])[0] ?? "?"}(${(n.props as Props)?.id ?? n._id}).${k}`);
      }
    }
    const rels = await g.query<{ _id: number; type: string; props: Props }>(
      "MATCH ()-[r]->() RETURN ID(r) AS _id, type(r) AS type, properties(r) AS props",
    );
    let relPropsFixed = 0;
    for (const r of rels) {
      for (const [k, v] of Object.entries(r.props ?? {})) {
        if (!hasOmar(v) || !KEY_OK.test(k)) continue;
        await g.query(`MATCH ()-[r]->() WHERE ID(r) = $_id SET r.\`${k}\` = $v`, { _id: r._id, v: fixText(v) });
        relPropsFixed++;
        touched.push(`rel ${r.type}.${k}`);
      }
    }

    const after = await scan(g);
    const proposals = await g.ro<{ id: string; status: string; created_by: string | null; decided_by: string | null }>(
      "MATCH (p:Proposal) RETURN p.id AS id, p.status AS status, p.created_by AS created_by, p.decided_by AS decided_by ORDER BY p.id",
    );
    return Response.json({
      mode: "apply",
      before: { persons: before.persons, omarOccurrences: before.omarOccurrences, nodeHits: before.nodeHits, relHits: before.relHits },
      touched,
      counts: { nodePropsFixed, relPropsFixed },
      after: { persons: after.persons, omarOccurrences: after.omarOccurrences, nodeHits: after.nodeHits, relHits: after.relHits, personEdges: after.personEdges },
      proposals,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
