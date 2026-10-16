import { TenantGraph, resolveTenantKey } from "@crewbrain/graph";

/** Resolve tenant param to a graph key. Defaults to acme; only acme or a live registered sandbox is accepted. */
export async function graphKeyFor(tenant?: string | null): Promise<string> {
  return resolveTenantKey(tenant);
}

export async function openTenant(tenant?: string | null): Promise<TenantGraph> {
  return TenantGraph.open(await graphKeyFor(tenant));
}
