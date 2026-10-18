import { randomUUID } from "node:crypto";
import type { TenantGraph } from "./tenant";
import { jaroWinkler } from "./text";

export interface ResolvedEntity { id: string; name: string; pos: number; via: "alias" | "fuzzy" }

export interface Citation { n: number; passageId: string; sourceId: string; sourceTitle: string; sourceKind: string; text: string }

export interface TraceReason {
  id: string;
  kind: string;
  text: string;
  passages: { id: string; text: string; sourceId: string; sourceTitle: string; sourceKind: string; createdAt: number }[];
}

export interface DecisionTrace {
  id: string;
  title: string;
  statement: string;
  status: string;
  decidedAt: number;
  validFrom: number;
  validTo: number | null;
  chose: { id: string; name: string }[];
  rejected: { id: string; name: string; reason: string }[];
  decidedBy: { id: string; name: string }[];
  approvedBy: { id: string; name: string }[];
  recordedIn: { id: string; title: string; kind: string; firstPassage: string | null }[];
  supersedes: { id: string; title: string }[];
  supersededBy: { id: string; title: string }[];
  reasons: TraceReason[];
}

export interface AskResult {
  question: string;
  asOf: number;
  mode: "graph-only";
  abstained: boolean;
  answer: string;
  entities: ResolvedEntity[];
  decision: DecisionTrace | null;
  alternatives: { id: string; title: string; score: number }[];
  closestRelated: { id: string; name: string }[];
  citations: Citation[];
  validation: { valid: string[]; invalid: string[] };
  /** Node ids on the answer path, for the trace view. */
  pathIds: string[];
  /** Every read-only Cypher statement that ran, with its parameters. */
  cypher: { query: string; params: Record<string, unknown> }[];
  latencyMs: number;
  questionId?: string;
  answerId?: string;
}

const Q_ENTITIES = "MATCH (e:Entity) RETURN e.id AS id, e.name AS name, e.aliases AS aliases";

const Q_CANDIDATES = `MATCH (d:Decision)-[r:CHOSE|REJECTED|ABOUT]->(e:Entity)
WHERE e.id IN $ids AND d.status IN ['accepted', 'superseded']
  AND d.valid_from <= $asOf AND (d.valid_to IS NULL OR d.valid_to > $asOf)
RETURN d.id AS id, d.title AS title, collect({rel: type(r), e: e.id}) AS hits`;

// FalkorDB 6.0.1: a pattern comprehension with a named relationship (`[rj:REJECTED]`) made every
// comprehension after it return []. Keep that one last and give each comprehension its own variables.
const Q_DECISION = `MATCH (d:Decision {id: $id})
RETURN d.id AS id, d.title AS title, d.statement AS statement, d.status AS status,
  d.decided_at AS decidedAt, d.valid_from AS validFrom, d.valid_to AS validTo,
  [(d)-[:CHOSE]->(ce:Entity) | {id: ce.id, name: ce.name}] AS chose,
  [(d)-[:DECIDED_BY]->(dp:Person) | {id: dp.id, name: dp.name}] AS decidedBy,
  [(d)-[:APPROVED_BY]->(ap:Person) | {id: ap.id, name: ap.name}] AS approvedBy,
  [(d)-[:SUPERSEDES]->(od:Decision) | {id: od.id, title: od.title}] AS supersedes,
  [(nd:Decision)-[:SUPERSEDES]->(d) | {id: nd.id, title: nd.title}] AS supersededBy,
  [(d)-[rj:REJECTED]->(re:Entity) | {id: re.id, name: re.name, reason: rj.reason}] AS rejected`;

const Q_RECORDED = `MATCH (d:Decision {id: $id})-[:RECORDED_IN]->(s:Source)
OPTIONAL MATCH (p:Passage {idx: 0})-[:PART_OF]->(s)
RETURN s.id AS id, s.title AS title, s.kind AS kind, p.id AS firstPassage, p.text AS firstText
ORDER BY CASE s.kind WHEN 'ticket' THEN 0 ELSE 1 END, s.created_at DESC`;

const Q_REASONS = `MATCH (d:Decision {id: $id})-[:BECAUSE]->(r:Reason)-[s:SUPPORTED_BY]->(p:Passage)-[:PART_OF]->(src:Source)
RETURN r.id AS reasonId, r.text AS reasonText, r.kind AS reasonKind, p.id AS passageId, p.text AS passageText,
  s.rank AS rank, src.id AS sourceId, src.title AS sourceTitle, src.kind AS sourceKind, src.created_at AS createdAt
ORDER BY reasonId, rank`;

const Q_CLOSEST = `MATCH (e:Entity)<-[:MENTIONS]-(p:Passage)-[:MENTIONS]->(o:Entity)
WHERE e.id IN $ids AND NOT o.id IN $ids
RETURN o.id AS id, o.name AS name, count(p) AS n ORDER BY n DESC, name LIMIT 5`;

const Q_VALIDATE = `MATCH (p:Passage)-[:PART_OF]->(s:Source) WHERE p.id IN $ids RETURN p.id AS id`;

const Q_PASSAGES = `MATCH (p:Passage)-[:PART_OF]->(s:Source) RETURN p.id AS id, p.text AS text, s.id AS sourceId, s.title AS sourceTitle, s.kind AS sourceKind`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STOP = new Set(["why", "did", "we", "choose", "chose", "over", "pick", "picked", "instead", "use", "the", "for", "what", "and", "with", "our", "storage", "rather", "than", "decide", "decided"]);
const GENERIC_Q_WORDS = new Set(["what", "why", "how", "when", "where", "which", "who", "whom", "whose", "does", "do", "did", "is", "are", "was", "were", "will", "would", "could", "should", "can", "tell", "about", "mention", "mentions", "sources", "source", "passages", "passage", "graph", "graphs", "knowledge", "base", "find", "search", "show", "list", "give", "have", "has", "had", "these", "those", "this", "that", "there", "their", "them", "then", "than", "also", "just", "only", "some", "any", "all", "more", "most", "such", "into", "onto", "from", "with", "without"]);

function questionKeywords(q: string): string[] {
  const words = q.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  const out = new Set<string>();
  for (const w of words) {
    if (STOP.has(w)) continue;
    if (GENERIC_Q_WORDS.has(w)) continue;
    out.add(w);
  }
  return [...out];
}

/** Alias match (longest first, masking matches), then Jaro-Winkler >= 0.92 on leftover words. */
export function resolveEntities(question: string, entities: { id: string; name: string; aliases: string[] }[]): ResolvedEntity[] {
  const pairs = entities.flatMap((e) => [e.name, ...(e.aliases ?? [])].map((a) => ({ e, a: a.toLowerCase() })));
  pairs.sort((x, y) => y.a.length - x.a.length);
  let text = question.toLowerCase();
  const out = new Map<string, ResolvedEntity>();
  for (const { e, a } of pairs) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRe(a)}(?![a-z0-9])`);
    const m = re.exec(text);
    if (!m) continue;
    if (!out.has(e.id)) out.set(e.id, { id: e.id, name: e.name, pos: m.index, via: "alias" });
    text = text.slice(0, m.index) + " ".repeat(a.length) + text.slice(m.index + a.length);
  }
  for (const m of text.matchAll(/[a-z0-9][a-z0-9-]{3,}/g)) {
    if (STOP.has(m[0])) continue;
    let best: { e: (typeof entities)[number]; s: number } | null = null;
    for (const { e, a } of pairs) {
      if (a.length < 4) continue;
      const s = jaroWinkler(m[0], a);
      if (s >= 0.92 && (!best || s > best.s)) best = { e, s };
    }
    if (best && !out.has(best.e.id)) out.set(best.e.id, { id: best.e.id, name: best.e.name, pos: m.index, via: "fuzzy" });
  }
  return [...out.values()].sort((a, b) => a.pos - b.pos);
}

/** "A over B", "A instead of B", "A rather than B", "A vs B": A is the claimed choice, B the claimed rejection. */
export function contrast(question: string, ents: ResolvedEntity[]): { chosen?: string; rejected?: string } {
  if (ents.length < 2) return ents.length === 1 ? { chosen: ents[0].id } : {};
  const q = question.toLowerCase();
  const m = /\b(over|instead of|rather than|vs\.?|versus|not)\b/.exec(q);
  if (!m) return { chosen: ents[0].id };
  const before = ents.filter((e) => e.pos < m.index);
  const after = ents.filter((e) => e.pos > m.index);
  return { chosen: before.at(-1)?.id ?? ents[0].id, rejected: after[0]?.id };
}

type Hit = { rel: "CHOSE" | "REJECTED" | "ABOUT"; e: string };

export function scoreCandidate(hits: Hit[], want: { chosen?: string; rejected?: string }): number {
  const has = (rel: Hit["rel"], e?: string) => !!e && hits.some((h) => h.rel === rel && h.e === e);
  // A decision only answers "why did we choose A" if it actually CHOSE A (or, with no named choice, rejected something named).
  if (want.chosen && !has("CHOSE", want.chosen)) return 0;
  if (!want.chosen && !hits.some((h) => h.rel !== "ABOUT")) return 0;
  // "A over B" also needs B to be rejected; otherwise the decision answers a different question.
  if (want.rejected && !has("REJECTED", want.rejected)) return 0;
  let s = 0;
  for (const h of hits) s += h.rel === "ABOUT" ? 1 : 2;
  if (has("CHOSE", want.chosen)) s += 4;
  if (has("REJECTED", want.rejected)) s += 4;
  return s;
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const names = (xs: { name: string }[]) =>
  xs.length <= 1 ? xs.map((x) => x.name).join("") : `${xs.slice(0, -1).map((x) => x.name).join(", ")} and ${xs.at(-1)!.name}`;

/** Graph-only answer: built only from the traced path, every claim tagged with a citation into that path. */
function composeAnswer(d: DecisionTrace, want: { rejected?: string }): { text: string; citations: Citation[] } {
  const citations: Citation[] = [];
  const cite = (p: { id: string; text: string; sourceId: string; sourceTitle: string; sourceKind: string }) => {
    let c = citations.find((x) => x.passageId === p.id);
    if (!c) {
      c = { n: citations.length + 1, passageId: p.id, sourceId: p.sourceId, sourceTitle: p.sourceTitle, sourceKind: p.sourceKind, text: p.text };
      citations.push(c);
    }
    return `[${c.n}]`;
  };
  const lines: string[] = [];
  const rec = d.recordedIn.find((r) => r.firstPassage);
  const recCite = rec && rec.firstPassage
    ? cite({ id: rec.firstPassage, text: (rec as { firstText?: string }).firstText ?? "", sourceId: rec.id, sourceTitle: rec.title, sourceKind: rec.kind })
    : "";
  const by = d.decidedBy.length ? ` by ${names(d.decidedBy)}` : "";
  const ok = d.approvedBy.length ? `, approved by ${names(d.approvedBy)}` : "";
  lines.push(`Decision ${d.id} "${d.title}" (${d.status}, decided ${fmtDate(d.decidedAt)}${by}${ok}) chose ${names(d.chose)}. ${d.statement} ${recCite}`.trim());
  if (d.rejected.length) {
    const ordered = [...d.rejected].sort((a, b) => (a.id === want.rejected ? -1 : b.id === want.rejected ? 1 : 0));
    lines.push(`Rejected: ${ordered.map((r) => `${r.name} (${r.reason})`).join("; ")}.`);
  }
  lines.push("Reasons:");
  for (const r of d.reasons) {
    // Prefer a passage not cited yet, so the answer spreads across sources.
    const fresh = r.passages.find((p) => !citations.some((c) => c.passageId === p.id)) ?? r.passages[0];
    const extra = r.passages.find((p) => p.id !== fresh.id && p.sourceId !== fresh.sourceId && !citations.some((c) => c.passageId === p.id));
    lines.push(`- ${r.text} ${cite(fresh)}${extra ? cite(extra) : ""}`);
  }
  if (d.supersededBy.length) lines.push(`Note: superseded by ${d.supersededBy.map((s) => `${s.id} "${s.title}"`).join(", ")}.`);
  lines.push("Sources:");
  for (const c of citations) lines.push(`[${c.n}] ${c.passageId} · ${c.sourceKind} ${c.sourceId} "${c.sourceTitle}"`);
  return { text: lines.join("\n"), citations };
}

/** Every [n] in the answer must map to a passage that is in the traced subgraph and exists in this tenant's graph. */
export async function validateCitations(g: TenantGraph, answer: string, citations: Citation[], subgraphIds: Set<string>, log?: AskResult["cypher"]) {
  const used = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const ids = citations.filter((c) => used.has(c.n)).map((c) => c.passageId);
  const missingMarker = [...used].filter((n) => !citations.some((c) => c.n === n)).map((n) => `[${n}]`);
  log?.push({ query: Q_VALIDATE, params: { ids } });
  const found = new Set((await g.ro<{ id: string }>(Q_VALIDATE, { ids })).map((r) => r.id));
  const valid = ids.filter((id) => subgraphIds.has(id) && found.has(id));
  const invalid = [...ids.filter((id) => !valid.includes(id)), ...missingMarker];
  return { valid, invalid };
}

export async function ask(g: TenantGraph, question: string, opts: { asOf?: number; store?: boolean; askedBy?: string } = {}): Promise<AskResult> {
  const t0 = performance.now();
  const asOf = opts.asOf ?? Date.now();
  const cypher: AskResult["cypher"] = [];
  const ro = async <T>(query: string, params: Record<string, unknown> = {}) => {
    cypher.push({ query, params });
    return g.ro<T>(query, params);
  };

  const allEntities = (await g.exists()) ? await ro<{ id: string; name: string; aliases: string[] }>(Q_ENTITIES) : [];
  const entities = resolveEntities(question, allEntities);
  const want = contrast(question, entities);
  const ids = entities.map((e) => e.id);

  let decision: DecisionTrace | null = null;
  let alternatives: AskResult["alternatives"] = [];
  if (ids.length) {
    const cands = await ro<{ id: string; title: string; hits: Hit[] }>(Q_CANDIDATES, { ids, asOf });
    const scored = cands
      .map((c) => ({ id: c.id, title: c.title, score: scoreCandidate(c.hits, want) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    alternatives = scored.slice(1, 4);
    if (scored.length) decision = await loadTrace(scored[0].id, ro);
  }

  let answer: string;
  let citations: Citation[] = [];
  let closestRelated: AskResult["closestRelated"] = [];
  const subgraph = new Set<string>();
  if (decision && decision.reasons.length) {
    for (const r of decision.reasons) for (const p of r.passages) subgraph.add(p.id);
    for (const r of decision.recordedIn) if (r.firstPassage) subgraph.add(r.firstPassage);
    ({ text: answer, citations } = composeAnswer(decision, want));
  } else {
    decision = null;
    const subject = entities.find((e) => e.id === want.chosen)?.name ?? entities[0]?.name;
    const other = entities.find((e) => e.id === want.rejected)?.name;
    answer = !subject
      ? "No recorded decision matches this question in this graph."
      : other
        ? `No recorded decision that chose ${subject} over ${other} in this graph.`
        : `No recorded decision about ${subject} in this graph.`;
    if (ids.length) closestRelated = (await ro<{ id: string; name: string }>(Q_CLOSEST, { ids })).map(({ id, name }) => ({ id, name }));

    if (entities.length === 0) {
      const allPassages = await ro<{ id: string; text: string; sourceId: string; sourceTitle: string; sourceKind: string }>(Q_PASSAGES);
      const keywords = questionKeywords(question);
      if (keywords.length >= 2) {
        const scored = allPassages
          .map((p) => {
            const lower = (p.text ?? "").toLowerCase();
            const matched = keywords.filter((k) => lower.includes(k));
            return { p, score: new Set(matched).size };
          })
          .filter((x) => x.score >= 2)
          .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
        const top = scored.slice(0, 3);
        if (top.length) {
          citations = top.map((x, i) => ({
            n: i + 1,
            passageId: x.p.id,
            sourceId: x.p.sourceId,
            sourceTitle: x.p.sourceTitle,
            sourceKind: x.p.sourceKind,
            text: x.p.text,
          }));
          for (const c of citations) subgraph.add(c.passageId);
          const lines: string[] = [];
          lines.push("No recorded decision matches this question in this graph. However, these passages in the graph's sources mention it:");
          for (const c of citations) lines.push(`- ${c.text} [${c.n}]`);
          lines.push("Sources:");
          for (const c of citations) lines.push(`[${c.n}] ${c.passageId} · ${c.sourceKind} ${c.sourceId} "${c.sourceTitle}"`);
          answer = lines.join("\n");
        }
      }
    }
  }
  const validation = await validateCitations(g, answer, citations, subgraph, cypher);
  if (validation.invalid.length) throw new Error(`citation validator rejected: ${validation.invalid.join(", ")}`);

  const pathIds = decision
    ? [
        decision.id,
        ...decision.chose.map((x) => x.id),
        ...decision.rejected.map((x) => x.id),
        ...decision.reasons.map((r) => r.id),
        ...citations.map((c) => c.passageId),
        ...new Set(citations.map((c) => c.sourceId)),
        ...decision.decidedBy.map((x) => x.id),
        ...decision.approvedBy.map((x) => x.id),
      ]
    : [];

  const result: AskResult = {
    question,
    asOf,
    mode: "graph-only",
    abstained: !decision,
    answer: decision ? `Graph-only answer (no model used)\n${answer}` : answer,
    entities,
    decision,
    alternatives,
    closestRelated,
    citations,
    validation,
    pathIds,
    cypher,
    latencyMs: Math.round(performance.now() - t0),
  };
  if (opts.store !== false && (await g.exists())) Object.assign(result, await storeAsk(g, result, opts.askedBy ?? "cli"));
  return result;
}

async function loadTrace(id: string, ro: <T>(q: string, p?: Record<string, unknown>) => Promise<T[]>): Promise<DecisionTrace | null> {
  const [d] = await ro<Omit<DecisionTrace, "reasons" | "recordedIn">>(Q_DECISION, { id });
  if (!d) return null;
  const recordedIn = await ro<DecisionTrace["recordedIn"][number] & { firstText: string | null }>(Q_RECORDED, { id });
  const rows = await ro<{
    reasonId: string; reasonText: string; reasonKind: string; passageId: string; passageText: string;
    sourceId: string; sourceTitle: string; sourceKind: string; createdAt: number;
  }>(Q_REASONS, { id });
  const reasons = new Map<string, TraceReason>();
  for (const r of rows) {
    if (!reasons.has(r.reasonId)) reasons.set(r.reasonId, { id: r.reasonId, kind: r.reasonKind, text: r.reasonText, passages: [] });
    reasons.get(r.reasonId)!.passages.push({
      id: r.passageId, text: r.passageText, sourceId: r.sourceId, sourceTitle: r.sourceTitle, sourceKind: r.sourceKind, createdAt: r.createdAt,
    });
  }
  return { ...d, recordedIn, reasons: [...reasons.values()] };
}

async function storeAsk(g: TenantGraph, r: AskResult, askedBy: string) {
  const questionId = `Q-${randomUUID().slice(0, 8)}`;
  const answerId = `A-${randomUUID().slice(0, 8)}`;
  await g.query(
    `CREATE (q:Question {id: $qid, text: $text, asked_by: $by, ts: $ts, as_of: $asOf})
     CREATE (a:Answer {id: $aid, text: $answer, model: 'none', mode: $mode, latency_ms: $lat, path_ids: $path})
     CREATE (q)-[:ANSWERED_BY]->(a)
     WITH a UNWIND $cites AS c MATCH (p:Passage {id: c.id}) CREATE (a)-[:CITES {n: c.n}]->(p)`,
    {
      qid: questionId, aid: answerId, text: r.question, by: askedBy, ts: Date.now(), asOf: r.asOf, answer: r.answer,
      mode: r.mode, lat: r.latencyMs, path: r.pathIds, cites: r.citations.map((c) => ({ id: c.passageId, n: c.n })),
    },
  );
  if (r.decision) await g.query("MATCH (a:Answer {id: $aid}), (d:Decision {id: $did}) CREATE (a)-[:CITES {n: 0}]->(d)", { aid: answerId, did: r.decision.id });
  return { questionId, answerId };
}
