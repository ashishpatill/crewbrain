export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Crewbrain</h1>
      <p className="mt-2 text-neutral-400">
        Shared memory graph for a crew of AI agents. Every answer comes with the path through the graph that produced it.
      </p>
      <p className="mt-6 font-mono text-sm text-neutral-500">
        Day 1: the UI is not built yet. Check <a className="underline" href="/api/health">/api/health</a> and use the{" "}
        <code>pnpm ask</code> CLI.
      </p>
    </main>
  );
}
