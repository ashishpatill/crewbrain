import { TenantGraph } from "@crewbrain/graph";

const KEY = /^t_(registry|acme|sbx_[a-z0-9]{8}|[a-z][a-z0-9_]{1,30})$/;

/** Resolve tenant query param to a graph key. Defaults to t_acme. Never trusts a raw graph key. */
export function graphKeyFor(tenant?: string | null): string {
  const id = (tenant || "acme").toLowerCase().replace(/^t_/, "");
  const key = `t_${id}`;
  if (!KEY.test(key)) throw new Error(`invalid tenant: ${tenant}`);
  return key;
}

export async function openTenant(tenant?: string | null): Promise<TenantGraph> {
  return TenantGraph.open(graphKeyFor(tenant));
}
