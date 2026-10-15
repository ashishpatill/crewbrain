import { TenantGraph, ask, disconnect } from "@crewbrain/graph";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const json = args.includes("--json");
const noStore = args.includes("--no-store");
const tenant = flag("--tenant") ?? "acme";
const asOfRaw = flag("--as-of");
const question = args.filter((a) => !a.startsWith("--")).join(" ").trim();
if (!question) {
  console.error('usage: pnpm ask "Why did we choose Backblaze over Neon storage?" [--tenant acme] [--as-of 2026-08-01] [--json] [--no-store]');
  process.exit(2);
}

const g = await TenantGraph.open(`t_${tenant}`);
const r = await ask(g, question, { asOf: asOfRaw ? Date.parse(asOfRaw) : undefined, store: !noStore });
if (json) {
  console.log(JSON.stringify(r, null, 2));
} else {
  console.log(`Q: ${r.question}   [graph ${g.key} · ${r.mode} · ${r.latencyMs} ms]`);
  console.log(`Entities: ${r.entities.map((e) => `${e.name}(${e.id},${e.via})`).join(", ") || "none"}`);
  console.log("");
  console.log(r.answer);
  console.log("");
  if (r.decision) {
    console.log(`Trace: Q -> ${r.decision.id}`);
    for (const c of r.decision.chose) console.log(`  CHOSE -> ${c.name}`);
    for (const c of r.decision.rejected) console.log(`  REJECTED -> ${c.name} (${c.reason})`);
    for (const x of r.decision.reasons) console.log(`  BECAUSE -> ${x.id} ${x.kind} -> SUPPORTED_BY ${x.passages.map((p) => p.id).join(", ")}`);
    for (const p of r.decision.decidedBy) console.log(`  DECIDED_BY -> ${p.name}`);
    for (const p of r.decision.approvedBy) console.log(`  APPROVED_BY -> ${p.name}`);
  } else if (r.closestRelated.length) {
    console.log(`Closest related: ${r.closestRelated.map((e) => e.name).join(", ")}`);
  }
  console.log(`Citations valid: ${r.validation.valid.length}/${r.citations.length}${r.answerId ? `   stored as ${r.questionId} -> ${r.answerId}` : ""}`);
}
await disconnect();
