import { FalkorDB } from "falkordb";

let dbPromise: Promise<FalkorDB> | null = null;

/** Single shared connection, from FALKORDB_URL (redis:// or rediss:// for TLS, e.g. FalkorDB Cloud). App code never uses it directly; it goes through TenantGraph. */
export function connect(url = process.env.FALKORDB_URL ?? "redis://localhost:6379"): Promise<FalkorDB> {
  if (!dbPromise) {
    const u = new URL(url);
    dbPromise = FalkorDB.connect({
      socket: u.protocol === "rediss:"
        ? { host: u.hostname, port: Number(u.port || 6379), tls: true, servername: u.hostname }
        : { host: u.hostname, port: Number(u.port || 6379) },
      username: u.username || undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    });
  }
  return dbPromise;
}

export async function disconnect(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    dbPromise = null;
    await db.close();
  }
}
