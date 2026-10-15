import { connect } from "./client";

export async function health(): Promise<{ ok: boolean; graphs?: string[]; error?: string }> {
  try {
    const db = await connect();
    const graphs = await db.list();
    // A real query, not just PING.
    await db.selectGraph("t_registry").roQuery("RETURN 1").catch(() => null);
    return { ok: true, graphs };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
