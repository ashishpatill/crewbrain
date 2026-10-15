import { TenantGraph, disconnect, migrate } from "@crewbrain/graph";

const keys = process.argv.slice(2).length ? process.argv.slice(2) : ["t_registry", "t_acme"];
for (const key of keys) {
  const g = await TenantGraph.open(key);
  const applied = await migrate(g);
  console.log(`${key}: ${applied.join(", ")}`);
}
await disconnect();
