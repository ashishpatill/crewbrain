import type { TenantGraph } from "./tenant";
import { FULLTEXT_INDEXES, NODE_LABELS, RANGE_INDEXES, VECTOR_DIM, VECTOR_INDEXES } from "./schema";

export interface Migration {
  id: string;
  run(g: TenantGraph): Promise<void>;
}

type IndexRow = { label: string; types: Record<string, string[]> };
type ConstraintRow = { type: string; label: string; properties: string[] };

async function indexTypes(g: TenantGraph): Promise<Map<string, Set<string>>> {
  // db.indexes() fails on a graph that does not exist yet; an empty graph has no indexes.
  if (!(await g.exists())) return new Map();
  const rows = await g.ro<IndexRow>(
    "CALL db.indexes() YIELD label, types, entitytype WHERE entitytype = 'NODE' RETURN label, types",
  );
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const [prop, kinds] of Object.entries(r.types ?? {})) {
      for (const k of kinds) out.set(`${r.label}.${prop}`, (out.get(`${r.label}.${prop}`) ?? new Set()).add(k));
    }
  }
  return out;
}

const has = (m: Map<string, Set<string>>, label: string, prop: string, kind: string) =>
  m.get(`${label}.${prop}`)?.has(kind) ?? false;

/** Labels and property names come from the static schema, never from input, so inlining is safe. */
export const migrations: Migration[] = [
  {
    id: "0001_range_indexes",
    async run(g) {
      const idx = await indexTypes(g);
      const wanted: Array<[string, string]> = [...NODE_LABELS.map((l) => [l, "id"] as [string, string]), ...RANGE_INDEXES];
      for (const [label, prop] of wanted) {
        if (!has(idx, label, prop, "RANGE")) await g.query(`CREATE INDEX FOR (n:${label}) ON (n.${prop})`);
      }
    },
  },
  {
    id: "0002_unique_id_constraints",
    async run(g) {
      const existing = await g.ro<ConstraintRow>("CALL db.constraints() YIELD type, label, properties RETURN type, label, properties");
      const done = new Set(existing.filter((c) => c.type === "UNIQUE").map((c) => `${c.label}.${c.properties.join(",")}`));
      for (const label of NODE_LABELS) {
        if (done.has(`${label}.id`)) continue;
        await g.admin().constraintCreate("UNIQUE" as never, "NODE" as never, label, "id");
      }
    },
  },
  {
    id: "0003_fulltext_indexes",
    async run(g) {
      const idx = await indexTypes(g);
      for (const [label, props] of FULLTEXT_INDEXES) {
        if (props.every((p) => has(idx, label, p, "FULLTEXT"))) continue;
        const on = props.map((p) => `n.${p}`).join(", ");
        await g.query(`CREATE FULLTEXT INDEX FOR (n:${label}) ON (${on})`);
      }
    },
  },
  {
    id: "0004_vector_indexes",
    async run(g) {
      const idx = await indexTypes(g);
      for (const [label, prop] of VECTOR_INDEXES) {
        if (has(idx, label, prop, "VECTOR")) continue;
        await g.query(
          `CREATE VECTOR INDEX FOR (n:${label}) ON (n.${prop}) OPTIONS {dimension:${VECTOR_DIM}, similarityFunction:'cosine'}`,
        );
      }
    },
  },
];

/** Applies every migration. Safe to run any number of times. */
export async function migrate(g: TenantGraph): Promise<string[]> {
  const applied: string[] = [];
  for (const m of migrations) {
    await m.run(g);
    applied.push(m.id);
  }
  return applied;
}
