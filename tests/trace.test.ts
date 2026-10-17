import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TenantGraph, ask, disconnect, validateCitations } from "@crewbrain/graph";
import { ACME, REGISTRY, SANDBOX, counts, seedAcme, seedSandbox } from "./helpers";

let acme: TenantGraph;

beforeAll(async () => {
  await seedAcme();
  acme = await TenantGraph.open(ACME);
});

afterAll(async () => {
  for (const k of [ACME, REGISTRY, SANDBOX]) await (await TenantGraph.open(k)).drop();
  await disconnect();
});

const SEED_QUESTIONS: Array<{ q: string; decision: string; chose: string; rejected?: string }> = [
  { q: "Why did we choose Amazon S3 over MySQL for media storage?", decision: "D-07", chose: "s3", rejected: "mysql" },
  { q: "Why did we pick Stripe instead of Adyen?", decision: "D-04", chose: "stripe", rejected: "adyen" },
  { q: "Why do we use Cloudinary for product media?", decision: "D-03", chose: "cloudinary" },
  { q: "Why Flutter rather than React Native for the mobile app?", decision: "D-05", chose: "flutter", rejected: "react-native" },
  { q: "Why Amplitude over Google Analytics 4?", decision: "D-06", chose: "amplitude", rejected: "ga4" },
];

/** Re-checks citations straight from FalkorDB, independent of the engine's own validator. */
async function assertCitationsInGraph(g: TenantGraph, decisionId: string, passageIds: string[]) {
  const rows = await g.ro<{ id: string }>(
    `MATCH (d:Decision {id: $d})
     MATCH (p:Passage)-[:PART_OF]->(s:Source)
     WHERE p.id IN $ids AND ((d)-[:BECAUSE]->(:Reason)-[:SUPPORTED_BY]->(p) OR (d)-[:RECORDED_IN]->(s))
     RETURN p.id AS id`,
    { d: decisionId, ids: passageIds },
  );
  expect(new Set(rows.map((r) => r.id))).toEqual(new Set(passageIds));
}

describe("trace: seed questions", () => {
  for (const s of SEED_QUESTIONS) {
    it(s.q, async () => {
      const r = await ask(acme, s.q, { store: false });
      expect(r.abstained).toBe(false);
      expect(r.decision?.id).toBe(s.decision);
      expect(r.decision?.chose.map((c) => c.id)).toContain(s.chose);
      if (s.rejected) expect(r.decision?.rejected.map((c) => c.id)).toContain(s.rejected);
      expect(r.decision!.reasons.length).toBeGreaterThanOrEqual(3);
      expect(r.validation.invalid).toEqual([]);
      expect(r.validation.valid.length).toBeGreaterThanOrEqual(3);
      for (const c of r.citations) expect(r.answer).toContain(`[${c.n}]`);
      await assertCitationsInGraph(acme, s.decision, r.citations.map((c) => c.passageId));
    });
  }

  it("headline decision carries deciders, rejection reason and three distinct reasons", async () => {
    const r = await ask(acme, "Why did we choose Amazon S3 over MySQL for media storage?", { store: false });
    const d = r.decision!;
    expect(d.decidedBy.map((p) => p.id)).toEqual(["omar"]);
    expect(d.approvedBy.map((p) => p.id)).toEqual(["nia"]);
    expect(d.rejected.find((x) => x.id === "mysql")?.reason).toMatch(/BLOB/);
    expect(d.reasons.map((x) => x.id).sort()).toEqual(["R-07-1", "R-07-2", "R-07-3"]);
    expect(new Set(r.citations.map((c) => c.sourceId)).size).toBeGreaterThanOrEqual(3);
  });

  it("resolves a misspelt entity with Jaro-Winkler", async () => {
    const r = await ask(acme, "Why did we choose Amazons3 over MySQL?", { store: false });
    expect(r.decision?.id).toBe("D-07");
    expect(r.entities.find((e) => e.id === "s3")?.via).toBe("fuzzy");
  });

  it("stores the question and answer with CITES edges", async () => {
    const r = await ask(acme, "Why did we choose Amazon S3 over MySQL for media storage?");
    const rows = await acme.ro<{ n: number }>(
      "MATCH (:Question {id: $q})-[:ANSWERED_BY]->(a:Answer {id: $a})-[:CITES]->(p:Passage) RETURN count(p) AS n",
      { q: r.questionId, a: r.answerId },
    );
    expect(rows[0].n).toBe(r.citations.length);
  });
});

describe("trace: abstain", () => {
  it("MongoDB has no recorded decision", async () => {
    const r = await ask(acme, "Why did we choose MongoDB?", { store: false });
    expect(r.abstained).toBe(true);
    expect(r.decision).toBeNull();
    expect(r.citations).toEqual([]);
    expect(r.answer).toBe("No recorded decision about MongoDB in this graph.");
    expect(r.closestRelated.map((e) => e.id)).toContain("amplitude");
  });

  it("reversed choice abstains instead of returning the S3 decision", async () => {
    const r = await ask(acme, "Why did we choose MySQL over Amazon S3 for media storage?", { store: false });
    expect(r.abstained).toBe(true);
  });

  it("unknown subject abstains", async () => {
    const r = await ask(acme, "Why did we choose Kafka?", { store: false });
    expect(r.abstained).toBe(true);
  });

  it("as of a date before the decision, there is no answer", async () => {
    const r = await ask(acme, "Why did we choose Amazon S3 over MySQL for media storage?", { store: false, asOf: Date.parse("2026-08-01T00:00:00+05:30") });
    expect(r.abstained).toBe(true);
  });
});

describe("citation validator", () => {
  it("rejects citations outside the traced subgraph or missing from the graph", async () => {
    const citations = [
      { n: 1, passageId: "P-11-1", sourceId: "S-11", sourceTitle: "", sourceKind: "ticket", text: "" },
      { n: 2, passageId: "P-16-0", sourceId: "S-16", sourceTitle: "", sourceKind: "chat", text: "" },
      { n: 3, passageId: "P-99-9", sourceId: "S-99", sourceTitle: "", sourceKind: "chat", text: "" },
    ];
    const v = await validateCitations(acme, "a [1] b [2] c [3] d [4]", citations, new Set(["P-11-1", "P-99-9"]));
    expect(v.valid).toEqual(["P-11-1"]);
    expect(v.invalid).toEqual(["P-16-0", "P-99-9", "[4]"]);
  });
});

describe("tenant isolation", () => {
  it("a sandbox graph cannot see t_acme, and t_acme cannot see the sandbox", async () => {
    await seedSandbox();
    const sbx = await TenantGraph.open(SANDBOX);

    const inSbx = await ask(sbx, "Why did we choose Amazon S3 over MySQL for media storage?", { store: false });
    expect(inSbx.abstained).toBe(true);
    expect(inSbx.entities).toEqual([]);

    const own = await ask(sbx, "Why did we choose SQLite over Redis?", { store: false });
    expect(own.decision?.id).toBe("D-01");
    expect(own.citations.map((c) => c.passageId)).toEqual(["P-01-0"]);

    const fromAcme = await ask(acme, "Why did we choose SQLite over Redis?", { store: false });
    expect(fromAcme.abstained).toBe(true);

    // Same ids exist in both graphs (D-01, S-01, P-01-0) but hold each tenant's own data.
    const [a] = await acme.ro<{ t: string }>("MATCH (d:Decision {id: 'D-01'}) RETURN d.title AS t");
    const [b] = await sbx.ro<{ t: string }>("MATCH (d:Decision {id: 'D-01'}) RETURN d.title AS t");
    expect(a.t).toBe("Primary database is MySQL");
    expect(b.t).toBe("Local data in SQLite");
    const leaked = await sbx.ro<{ n: number }>("MATCH (p:Passage) WHERE p.id IN ['P-11-1', 'P-09-1'] RETURN count(p) AS n");
    expect(leaked[0].n).toBe(0);
  });

  it("registry holds tenants only", async () => {
    const reg = await TenantGraph.open(REGISTRY);
    const rows = await reg.ro<{ l: string; n: number }>("MATCH (n) RETURN labels(n)[0] AS l, count(n) AS n");
    expect(rows.map((r) => r.l)).toEqual(["Tenant"]);
  });

  it("refuses graph keys outside the tenant naming scheme", async () => {
    for (const bad of ["acme", "t_", "t_ACME", "t_acme}", "t_sbx_x; GRAPH.DELETE t_acme", "../t_acme"]) {
      await expect(TenantGraph.open(bad)).rejects.toThrow(/invalid tenant graph key/);
    }
  });
});

describe("migration and seed are idempotent", () => {
  it("re-seeding without reset leaves node and edge counts unchanged", async () => {
    await seedAcme();
    const before = await counts(ACME);
    const { seedTenant } = await import("@crewbrain/graph");
    const { acmeSeed, acmeCorpus } = await import("../seed/index");
    await seedTenant(acmeSeed(), acmeCorpus(), { graphKey: ACME, registryKey: REGISTRY });
    await seedTenant(acmeSeed(), acmeCorpus(), { graphKey: ACME, registryKey: REGISTRY });
    expect(await counts(ACME)).toEqual(before);
    const idx = await acme.ro<{ label: string }>("CALL db.indexes() YIELD label RETURN label");
    expect(idx.length).toBe(19);
  });
});
