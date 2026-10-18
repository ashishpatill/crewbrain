"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "../components/tenant";

type Task = { id: string; title: string; status: string; version: number; claimedBy: string | null; assignedTo: string | null };
type Handoff = { id: string; ts: number; note: string; accepted: boolean; from: string; to: string; task: string; carries: { id: string; label: string; text: string }[] };
type Agent = { id: string; role: string; inbox: number; openTasks: number; lastEpisode: string | null };
type Step = { agent: string; action: string; detail: string; ids: string[] };
type Race = { agents: number; tasks: number; claimed: number; doubleClaims: number; conflicts: number; p50ms: number; p95ms: number };

const COLS = ["todo", "claimed", "in_progress", "handed_off", "done"];

export default function AgentsPage() {
  const [tenant] = useTenant();
  const [data, setData] = useState<{ agents: Agent[]; tasks: Task[]; handoffs: Handoff[] }>({ agents: [], tasks: [], handoffs: [] });
  const [steps, setSteps] = useState<Step[]>([]);
  const [race, setRace] = useState<Race | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [claimAgent, setClaimAgent] = useState("researcher");
  const [handoffTo, setHandoffTo] = useState("coder");
  const [handoffNote, setHandoffNote] = useState("");
  const [handoffCarries, setHandoffCarries] = useState("");
  const load = useCallback(() => fetch(`/api/agents?tenant=${encodeURIComponent(tenant)}`).then((r) => r.json()).then((j) => (j.error ? setErr(j.error) : setData(j))), [tenant]);
  useEffect(() => { load(); }, [load]);
  async function act(action: "scenario" | "race") {
    setBusy(true); setErr(null);
    const r = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, tenant }) });
    const j = await r.json();
    if (!r.ok) setErr(j.error); else if (action === "scenario") setSteps(j.steps); else setRace(j);
    setBusy(false); load();
  }
  async function claim(taskId: string) {
    setBusy(true); setErr(null);
    const r = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "claim", tenant, taskId, agent: claimAgent }) });
    const j = await r.json();
    if (!r.ok) setErr(j.error);
    setBusy(false); load();
  }
  async function handoffTask(task: Task) {
    setBusy(true); setErr(null);
    const carries = handoffCarries.split(",").map((s) => s.trim()).filter(Boolean);
    const r = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "handoff", tenant, taskId: task.id, from: task.claimedBy, to: handoffTo, note: handoffNote, carries }) });
    const j = await r.json();
    if (!r.ok) setErr(j.error);
    setBusy(false); load();
  }
  async function acceptHandoff(h: Handoff) {
    setBusy(true); setErr(null);
    const r = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept", tenant, handoffId: h.id, agent: h.to }) });
    const j = await r.json();
    if (!r.ok) setErr(j.error);
    setBusy(false); load();
  }
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Agents</h1>
        <button disabled={busy} onClick={() => act("scenario")} className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">Run scenario: signed URLs for lookbook videos</button>
        <button disabled={busy} onClick={() => act("race")} className="rounded border border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-50">Race test: 8 agents x 50 tasks</button>
      </div>
      <p className="text-xs text-neutral-400">Scenario is a scripted demo flow that performs real graph writes. Manual claim/handoff below use the same graph operations.</p>
      {err && <div className="text-sm text-red-400">{err}</div>}
      <div className="flex gap-4 font-mono text-xs">
        {data.agents.map((a) => (
          <div key={a.id} className="rounded border border-neutral-800 p-2">
            <div className="text-neutral-200">{a.id}</div>
            <div className="text-neutral-500">{a.openTasks} open · {a.inbox} in inbox</div>
            {a.lastEpisode && <div className="max-w-56 text-neutral-400">last: {a.lastEpisode}</div>}
          </div>
        ))}
      </div>
      {race && (
        <div className="rounded border border-neutral-800 p-3 font-mono text-xs">
          {race.agents} agents · {race.tasks} tasks · claimed <b>{race.claimed}</b> · double claims <b>{race.doubleClaims}</b> · lost races {race.conflicts} · p50 {race.p50ms} ms · p95 {race.p95ms} ms
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">claim as
          <select className="input" value={claimAgent} onChange={(e) => setClaimAgent(e.target.value)}>
            {["scribe", "researcher", "coder", "reviewer"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">hand off to
          <select className="input" value={handoffTo} onChange={(e) => setHandoffTo(e.target.value)}>
            {["scribe", "researcher", "coder", "reviewer"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <input className="input" placeholder="note" value={handoffNote} onChange={(e) => setHandoffNote(e.target.value)} />
        <input className="input" placeholder="evidence ids, comma-separated (Memory/Passage/Decision)" value={handoffCarries} onChange={(e) => setHandoffCarries(e.target.value)} />
      </div>
      <div className="grid grid-cols-5 gap-2 text-xs">
        {COLS.map((c) => (
          <div key={c} className="rounded border border-neutral-800 p-2">
            <div className="mb-1 font-semibold text-neutral-400">{c}</div>
            {data.tasks.filter((t) => t.status === c).map((t) => (
              <div key={t.id} className="mb-1 rounded bg-neutral-900 p-1">
                <div>{t.title}</div>
                <div className="font-mono text-neutral-500">{t.id} v{t.version} {t.claimedBy ?? t.assignedTo ?? ""}</div>
                {t.status === "todo" && (
                  <button disabled={busy} onClick={() => claim(t.id)} className="mt-1 rounded border border-neutral-700 px-2 py-0.5 disabled:opacity-50">Claim</button>
                )}
                {(t.status === "claimed" || t.status === "in_progress") && (
                  <button disabled={busy || !t.claimedBy} onClick={() => handoffTask(t)} className="mt-1 rounded border border-neutral-700 px-2 py-0.5 disabled:opacity-50">Hand off</button>
                )}
                {t.status === "handed_off" && (
                  <div className="mt-1 text-neutral-400">waiting for assignee to accept via handoff below</div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div>
        <h2 className="mb-1 text-sm font-semibold">Handoffs (each must carry evidence)</h2>
        <ul className="space-y-1 text-xs">
          {data.handoffs.map((h) => (
            <li key={h.id} className="rounded border border-neutral-800 p-2">
              <span className="font-mono">{h.from} → {h.to}</span> · {h.note} {h.accepted ? "· accepted" : "· pending"}
              {!h.accepted && (
                <button disabled={busy} onClick={() => acceptHandoff(h)} className="ml-2 rounded border border-neutral-700 px-2 py-0.5 disabled:opacity-50">Accept</button>
              )}
              <ul className="ml-4 list-disc text-neutral-400">{h.carries.map((c) => <li key={c.id}><span className="font-mono">{c.label} {c.id}</span>: {c.text}</li>)}</ul>
            </li>
          ))}
        </ul>
      </div>
      {steps.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold">Last scenario run</h2>
          <ol className="list-decimal pl-5 font-mono text-xs text-neutral-300">{steps.map((s, i) => <li key={i}>{s.agent} · {s.action} · {s.detail}</li>)}</ol>
        </div>
      )}
    </div>
  );
}
