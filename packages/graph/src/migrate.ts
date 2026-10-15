import type { TenantGraph } from "./tenant";

export interface Migration {
  id: string;
  run(g: TenantGraph): Promise<void>;
}

/** Ordered schema migrations, applied to every tenant graph. Each must be idempotent. */
export const migrations: Migration[] = [];

export async function migrate(g: TenantGraph): Promise<string[]> {
  const applied: string[] = [];
  for (const m of migrations) {
    await m.run(g);
    applied.push(m.id);
  }
  return applied;
}
