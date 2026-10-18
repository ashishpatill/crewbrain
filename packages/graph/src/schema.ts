/** Schema from PLAN.md §4.2 / §4.4. One definition shared by migrations, seed and tests. */
export const NODE_LABELS = [
  "Person", "Team", "Project", "Entity", "Agent", "Source", "Passage", "Decision", "Reason",
  "Memory", "Episode", "Turn", "Procedure", "Task", "Handoff", "Question", "Answer", "Proposal",
  "Run", "Tenant",
] as const;

export type NodeLabel = (typeof NODE_LABELS)[number];

/** Extra range indexes beyond `id`. */
export const RANGE_INDEXES: Array<[NodeLabel, string]> = [
  ["Decision", "status"],
  ["Task", "status"],
  ["Memory", "valid_to"],
  ["Source", "created_at"],
];

export const FULLTEXT_INDEXES: Array<[NodeLabel, string[]]> = [
  ["Entity", ["name"]],
  ["Passage", ["text"]],
  ["Decision", ["title", "statement"]],
  ["Memory", ["text"]],
];

export const VECTOR_DIM = 384;
export const VECTOR_INDEXES: Array<[NodeLabel, string]> = [
  ["Passage", "embedding"],
  ["Memory", "embedding"],
];
