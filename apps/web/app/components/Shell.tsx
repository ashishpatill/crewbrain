"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { MemoryMeter } from "./MemoryMeter";
import { useTenant } from "./tenant";

const NAV = [
  { href: "/start", label: "Start" },
  { href: "/ask", label: "Ask" },
  { href: "/timeline", label: "Timeline" },
  { href: "/review", label: "Review" },
  { href: "/ingest", label: "Ingest" },
  { href: "/agents", label: "Agents" },
  { href: "/sandbox", label: "Sandboxes" },
  { href: "/roadmap", label: "Roadmap" },
];

type SandboxOption = { id: string; graph: string };

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [tenant, setTenant] = useTenant();
  const [options, setOptions] = useState<{ value: string; label: string }[]>([
    { value: "acme", label: "acme (Harborlight demo)" },
  ]);

  useEffect(() => {
    let live = true;
    fetch("/api/sandbox")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        if (!live) return;
        const sandboxes: SandboxOption[] = j.sandboxes ?? [];
        setOptions([
          { value: "acme", label: "acme (Harborlight demo)" },
          ...sandboxes.map((s) => ({ value: s.id, label: s.id + " (" + s.graph + ")" })),
        ]);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="banner-demo">Demo data · Harborlight Outfitters (fictional) · FalkorDB only · graph-only answers (no paid model)</div>
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <Link href="/ask" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-neutral-100">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden />
          Crewbrain
        </Link>
        <select
          className="input w-full font-mono text-xs sm:w-auto"
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
        >
          {[...(options.some((o) => o.value === tenant) ? [] : [{ value: tenant, label: tenant }]), ...options].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="hidden sm:block">
          <MemoryMeter tenant={tenant} />
        </div>
        <div className="hidden font-mono text-xs text-neutral-500 sm:block">
          model: <span className="text-neutral-400">graph-only</span>
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-800 p-2 nav-scroll-fade md:w-48 md:flex-col md:border-b-0 md:border-r md:overflow-visible md:[mask-image:none] md:[-webkit-mask-image:none]">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="nav-link"
              data-active={path === n.href || path.startsWith(n.href + "/")}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
