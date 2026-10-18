import { describe, expect, it } from "vitest";
import { SUGGESTIONS } from "../apps/web/app/start/suggestions";
import { parseAskPrefill } from "../apps/web/app/ask/prefill";

describe("suggestions", () => {
  it("has exactly 6 suggestions", () => {
    expect(SUGGESTIONS).toHaveLength(6);
  });

  it("requirement suggestions have non-empty text", () => {
    const reqs = SUGGESTIONS.filter((s) => s.action.type === "requirement");
    expect(reqs.length).toBeGreaterThan(0);
    for (const s of reqs) {
      if (s.action.type === "requirement") expect(s.action.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("link suggestions start with /", () => {
    const links = SUGGESTIONS.filter((s) => s.action.type === "link");
    for (const s of links) {
      if (s.action.type === "link") expect(s.action.href.startsWith("/")).toBe(true);
    }
  });

  it("as-of chip points to /ask with asOf=2026-09-01", () => {
    const chip = SUGGESTIONS.find((s) => s.action.type === "link" && s.action.href.includes("asOf=2026-09-01"));
    expect(chip).toBeDefined();
    if (chip && chip.action.type === "link") {
      expect(chip.action.href.startsWith("/ask")).toBe(true);
      expect(chip.action.href).toContain("asOf=2026-09-01");
    }
  });
});

describe("parseAskPrefill", () => {
  it("parses question and asOf", () => {
    const params = new URLSearchParams("question=Hello&asOf=2026-09-01");
    expect(parseAskPrefill(params)).toEqual({ question: "Hello", asOfDate: "2026-09-01" });
  });

  it("returns empty for no params", () => {
    expect(parseAskPrefill(new URLSearchParams())).toEqual({});
  });
});
