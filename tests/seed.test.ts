import { describe, expect, it } from "vitest";
import { findMentions } from "@crewbrain/graph";
import { acmeCorpus, acmeSeed } from "../seed/index";

describe("Acme corpus", () => {
  const corpus = acmeCorpus();
  const seed = acmeSeed();

  it("has about 40 sources with unique ids and passages", () => {
    expect(corpus.length).toBe(40);
    expect(new Set(corpus.map((s) => s.id)).size).toBe(40);
    const pids = corpus.flatMap((s) => s.passages.map((p) => p.id));
    expect(new Set(pids).size).toBe(pids.length);
  });

  it("every decision reason points at real passages", () => {
    const pids = new Set(corpus.flatMap((s) => s.passages.map((p) => p.id)));
    for (const d of seed.decisions) for (const r of d.reasons) for (const p of r.passages) expect(pids.has(p), `${r.id} -> ${p}`).toBe(true);
  });

  it("alias matching prefers the longest alias", () => {
    expect(findMentions("Omar is reading about React Native with Expo", seed.entities)).toEqual(["react-native"]);
    expect(findMentions("MySQL and S3", seed.entities).sort()).toEqual(["mysql", "s3"]);
    expect(findMentions("export the expo build", seed.entities)).toEqual(["react-native"]);
  });
});
