"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MemoryMeter } from "./MemoryMeter";

const NAV = [
  { href: "/ask", label: "Ask" },
  { href: "/timeline", label: "Timeline" },
  { href: "/review", label: "Review" },
  { href: "/ingest", label: "Ingest" },
  { href: "/agents", label: "Agents" },
  { href: "/sandbox", label: "Sandboxes" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-screen flex-col">
      <div className="banner-demo">Demo data · Harborlight Outfitters (fictional) · FalkorDB only · graph-only answers (no paid model)</div>
      <header className="flex items-center gap-4 border-b border-neutral-800 px-4 py-2">
        <Link href="/ask" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-neutral-100">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden />
          Crewbrain
        </Link>
        <div className="font-mono text-xs text-neutral-500">
          tenant: <span className="text-neutral-300">acme</span>
        </div>
        <div className="ml-auto"><MemoryMeter /></div>
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
          <div className="mt-6 px-3 font-mono text-[10px] uppercase tracking-wider text-neutral-600">Soon</div>
          <span className="nav-link opacity-40">Explorer</span>
          <span className="nav-link opacity-40">Agents</span>
        </nav>
        <main className="min-w-0 flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
