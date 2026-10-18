import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pageSrc = readFileSync(join(root, "apps/web/app/page.tsx"), "utf8");
const shellSrc = readFileSync(join(root, "apps/web/app/components/Shell.tsx"), "utf8");

describe("home landing page", () => {
  it("does not redirect", () => {
    expect(pageSrc).not.toMatch(/redirect\(/);
  });

  it("contains CTAs to /start, /ask, /ingest", () => {
    expect(pageSrc).toContain('href="/start"');
    expect(pageSrc).toContain('href="/ask"');
    expect(pageSrc).toContain('href="/ingest"');
  });

  it("mentions limits wording", () => {
    expect(pageSrc.toLowerCase()).toContain("not semantic");
    expect(pageSrc.toLowerCase()).toContain("claim");
  });

  it("hero text present", () => {
    expect(pageSrc).toContain("Crewbrain");
    expect(pageSrc).toContain("a shared memory graph for agent teams");
    expect(pageSrc).toContain("decisions with reasons, citations, human approval");
  });
});

describe("shell nav", () => {
  it("first nav entry is Home", () => {
    const m = shellSrc.match(/const NAV = \[\s*\{\s*href:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("/");
    expect(m![2]).toBe("Home");
  });

  it("logo links to /", () => {
    expect(shellSrc).toContain('href="/"');
  });

  it("home active state is exact match", () => {
    expect(shellSrc).toContain('n.href === "/" ? path === "/"');
  });
});
