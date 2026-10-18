import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TenantGraph, ask, disconnect, ingestDocument, listProposals } from "@crewbrain/graph";
import { ACME, REGISTRY, seedAcme } from "./helpers";
import { validateUploadFile, MAX_UPLOAD_BYTES, SUPPORTED_UPLOAD_EXTS } from "../apps/web/app/ingest/upload";

let acme: TenantGraph;

beforeAll(async () => {
  await seedAcme();
  acme = await TenantGraph.open(ACME);
});

afterAll(async () => {
  for (const k of [ACME, REGISTRY]) await (await TenantGraph.open(k)).drop();
  await disconnect();
});

describe("upload validation", () => {
  it("accepts .txt/.md/.pdf and rejects .docx and oversized", () => {
    expect(validateUploadFile("note.txt", 10).ok).toBe(true);
    expect(validateUploadFile("readme.md", 10).ok).toBe(true);
    expect(validateUploadFile("doc.pdf", 10).ok).toBe(true);
    const docx = validateUploadFile("doc.docx", 10);
    expect(docx.ok).toBe(false);
    expect((docx.error || docx.message || "")).toMatch(/supported/i);
    expect((docx.error || docx.message || "")).toContain(".txt");
    const big = validateUploadFile("big.txt", MAX_UPLOAD_BYTES + 1);
    expect(big.ok).toBe(false);
    expect((big.error || big.message || "")).toMatch(/exceed|too large/i);
    expect(SUPPORTED_UPLOAD_EXTS).toContain(".txt");
    expect(SUPPORTED_UPLOAD_EXTS).toContain(".pdf");
  });
});

describe("ingest document knowledge base", () => {
  it("persists Source + Passages and creates a proposal", async () => {
    const title = "zorblax-quillfruit-notes.md";
    const text = "Zorblax quillfruit notes: the Zorblax adapter uses quillfruit seeds for indexing.";
    const res = await ingestDocument(acme, { text, title, kind: "doc", author: "ashish" });
    expect(res.proposalId).toBeTruthy();
    const passages = await acme.ro<{ id: string; text: string }>(
      "MATCH (p:Passage)-[:PART_OF]->(s:Source {title: $t}) RETURN p.id AS id, p.text AS text",
      { t: title },
    );
    expect(passages.length).toBeGreaterThan(0);
    expect(passages.some((p) => p.text.includes("Zorblax") && p.text.includes("quillfruit"))).toBe(true);

    const markerPassageId = res.passageIds[0];
    const q = "What do sources say about Zorblax quillfruit?";
    const askRes = await ask(acme, q, { store: false });
    expect(askRes.abstained).toBe(true);
    expect(askRes.decision).toBeNull();
    expect(askRes.citations.length).toBeGreaterThan(0);
    expect(askRes.citations.map((c) => c.passageId)).toContain(markerPassageId);
    expect(askRes.answer).toContain("Zorblax");
    expect(askRes.validation.invalid).toEqual([]);
  });

  it("MongoDB still abstains with empty citations and exact answer", async () => {
    const r = await ask(acme, "Why did we choose MongoDB?", { store: false });
    expect(r.abstained).toBe(true);
    expect(r.decision).toBeNull();
    expect(r.citations).toEqual([]);
    expect(r.answer).toBe("No recorded decision about MongoDB in this graph.");
  });
});
