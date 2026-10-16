import type { FalkorDB } from "falkordb";
import { connect } from "./client";

/** Graph keys: t_registry, t_acme, t_sbx_<8 chars>. Anything else is refused. */
const TENANT_KEY = /^t_(registry|acme|sbx_[a-z0-9]{8}|[a-z][a-z0-9_]{1,30})$/;

export type Params = Record<string, unknown>;

/**
 * A handle bound to exactly one FalkorDB graph key. Every repository function takes one of
 * these, so no query can reach another tenant's graph.
 */
export class TenantGraph {
  private constructor(private readonly db: FalkorDB, readonly key: string) {}

  static async open(key: string): Promise<TenantGraph> {
    if (!TENANT_KEY.test(key)) throw new Error(`invalid tenant graph key: ${key}`);
    return new TenantGraph(await connect(), key);
  }

  private get graph() {
    return this.db.selectGraph(this.key);
  }

  async query<T = Record<string, unknown>>(cypher: string, params: Params = {}): Promise<T[]> {
    const res = await this.graph.query<T>(cypher, { params: params as never });
    return (res.data ?? []) as T[];
  }

  /** Read-only query (GRAPH.RO_QUERY). Use for every read path. */
  async ro<T = Record<string, unknown>>(cypher: string, params: Params = {}): Promise<T[]> {
    const res = await this.graph.roQuery<T>(cypher, { params: params as never });
    return (res.data ?? []) as T[];
  }

  async exists(): Promise<boolean> {
    const list = await this.db.list();
    return list.includes(this.key);
  }

  async drop(): Promise<void> {
    if (await this.exists()) await this.graph.delete();
  }

  /** GRAPH.MEMORY USAGE for this graph, parsed into a flat object (values in MB). */
  async memoryUsage(): Promise<Record<string, number | Record<string, number>>> {
    const reply = (await this.graph.memoryUsage()) as unknown[];
    return parseMemoryReply(reply);
  }

  /** Raw graph handle for index/constraint admin, used only by migrations. */
  admin() {
    return this.graph;
  }
}

/** GRAPH.MEMORY USAGE replies alternate name/value; nested arrays are per-label or per-type maps. */
export function parseMemoryReply(reply: unknown[]): Record<string, number | Record<string, number>> {
  const out: Record<string, number | Record<string, number>> = {};
  for (let i = 0; i + 1 < reply.length; i += 2) {
    const k = String(reply[i]);
    const v = reply[i + 1];
    if (Array.isArray(v)) {
      const m: Record<string, number> = {};
      for (let j = 0; j + 1 < v.length; j += 2) m[String(v[j])] = Number(v[j + 1]);
      out[k] = m;
    } else out[k] = Number(v);
  }
  return out;
}
