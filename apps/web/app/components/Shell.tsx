"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { MemoryMeter } from "./MemoryMeter";
import { useTenant } from "./tenant";

const NAV = [
  { href: "/ask", label: "Ask" },
  { href: "/timeline", label: "Timeline" },
  { href: "/review", label: "Review" },
  { href: "/ingest", label: "Ingest" },
  { href: "/agents", label: "Agents" },
  { href: "/sandbox", label: "Sandboxes" },
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
      <header className="flex items-center gap-4 border-b border-neutral-800 px-4 py-2">
        <Link href="/ask" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-neutral-100">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden />
          Crewbrain
        </Link>
        <select
          className="input font-mono text-xs bg-transparent"
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
        >
          {[...(options.some((o) => o.value === tenant) ? [] : [{ value: tenant, label: tenant }]), ...options].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="ml-auto"><MemoryMeter tenant={tenant} /></div>
        <div className="font-mono text-xs text-neutral-500">
          model: <span className="text-neutral-400">graph-only</span>
        </div>
      </header>
      <div className="flex flex-1">
        <nav className="w-44 shrink-0 border-r border-neutral-800 p-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="nav-link" data-active={path === n.href || path.startsWith(n.href + "/")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}