import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus, type TenantSeed } from "@crewbrain/graph";

const here = dirname(fileURLToPath(import.meta.url));

export const acmeSeed = (): TenantSeed => JSON.parse(readFileSync(join(here, "acme.json"), "utf8"));
export const acmeCorpus = () => loadCorpus(join(here, "corpus"));
