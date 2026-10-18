"use client";

import { useState } from "react";
import Link from "next/link";
import { useTenant } from "../components/tenant";
import { SUPPORTED_UPLOAD_EXTS, MAX_UPLOAD_BYTES, validateUploadFile } from "./upload";

export default function IngestPage() {
  const [tenant] = useTenant();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("chat");
  const [author, setAuthor] = useState("omar");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sourceId: string; passageIds: string[]; proposalId: string | null } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadSample = async () => {
    setError(null);
    const res = await fetch("/api/ingest");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || res.statusText);
      return;
    }
    setTitle(data.title);
    setKind(data.kind);
    setAuthor(data.author);
    setText(data.text);
  };

  const handleFile = async (file: File) => {
    setError(null);
    const v = validateUploadFile(file.name, file.size);
    if (!v.ok) {
      setError(v.error || v.message || "Invalid file");
      return;
    }
    try {
      const content = await file.text();
      setTitle(file.name);
      setText(content);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant, title, kind, author, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <p className="text-sm text-neutral-400">
        Paste a short doc. No LLM: text is chunked into <code>Source</code>/<code>Passage</code> nodes,
        and any ingested doc opens a reviewable memory proposal in Review. The signed-URL sample
        additionally opens a decision proposal that partly supersedes D-07.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => void loadSample()}>
          Load sample chat
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded border border-dashed p-4 text-sm ${dragOver ? "border-emerald-400 bg-emerald-950/20" : "border-neutral-700"}`}
      >
        <div className="mb-2 text-xs text-neutral-500">
          Upload a file ({SUPPORTED_UPLOAD_EXTS.join(", ")}, max {MAX_UPLOAD_BYTES} bytes). PDF/DOCX are not supported yet (no parser in repo).
        </div>
        <input type="file" accept={SUPPORTED_UPLOAD_EXTS.join(",")} onChange={onFileChange} />
        <div className="mt-1 text-xs text-neutral-600">or drag &amp; drop a file here</div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-neutral-500">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Kind</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="chat">chat</option>
            <option value="doc">doc</option>
            <option value="ticket">ticket</option>
            <option value="meeting">meeting</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Author</label>
          <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-neutral-500">Text</label>
        <textarea className="input min-h-40 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      <button type="button" className="btn btn-accent w-fit" disabled={loading || !text.trim()} onClick={() => void submit()}>
        {loading ? "Ingesting…" : "Ingest → propose"}
      </button>

      {error && <div className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}

      {result && (
        <div className="panel p-3 text-sm">
          <div>
            Wrote <span className="font-mono text-emerald-300">{result.sourceId}</span> with{" "}
            {result.passageIds.length} passage{result.passageIds.length === 1 ? "" : "s"}.
          </div>
          {result.proposalId ? (
            <div className="mt-2">
              Opened proposal <span className="font-mono text-emerald-300">{result.proposalId}</span>.{" "}
              <Link href="/review" className="underline">Review it →</Link>
            </div>
          ) : (
            <div className="mt-2 text-neutral-500">No proposal was opened.</div>
          )}
          <div className="mt-2 font-mono text-[11px] text-neutral-600">{result.passageIds.join(", ")}</div>
        </div>
      )}
    </div>
  );
}
