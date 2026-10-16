import { seedTenant, seedDemoMemories, TenantGraph, disconnect } from "@crewbrain/graph";
import { acmeCorpus, acmeSeed } from "../seed/index";

const reset = process.argv.includes("--reset");
const report = await seedTenant(acmeSeed(), acmeCorpus(), { reset });
const g = await TenantGraph.open(report.graph);
const memories = await seedDemoMemories(g);
console.log(JSON.stringify({ ...report, memories: memories.length }, null, 2));
await disconnect();
