export default function RoadmapPage() {
  const items = [
    {
      title: "PDF & DOCX parsing with page-level citations",
      detail: "Parse real documents and cite the page/section, not just the passage.",
    },
    {
      title: "Semantic & hybrid search",
      detail: "Embeddings over passages/memories combined with the graph trace; the declared vector/fulltext indexes exist but are unused today.",
    },
    {
      title: "Pipeline builder",
      detail: "Compose ingest → propose → review → remember → assign flows instead of fixed screens.",
    },
    {
      title: "Local proposal triage",
      detail: "On-device ranking/summaries of pending proposals to help a human decide; approval stays human.",
    },
    {
      title: "bimrag internal retrieval",
      detail: "Private internal BIM retrieval component; no public endpoint, and only after an open-kernel vs hosted decision is written.",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Roadmap</h1>
        <p className="page-desc">Not available yet — no buttons, no waitlist; this page only says what is planned and what it depends on.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((it, i) => (
          <div key={it.title} className={i === items.length - 1 ? "card sm:col-span-2" : "card"}>
            <div className="mb-2"><span className="pill pill-pending">Coming soon</span></div>
            <div className="text-sm font-medium text-neutral-100">{it.title}</div>
            <div className="mt-1 text-xs text-neutral-400">{it.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
