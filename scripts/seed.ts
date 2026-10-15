import { disconnect, seedTenant } from "@crewbrain/graph";
import { acmeCorpus, acmeSeed } from "../seed/index";

const reset = process.argv.includes("--reset");
const report = await seedTenant(acmeSeed(), acmeCorpus(), { reset });
console.log(JSON.stringify(report));
await disconnect();
