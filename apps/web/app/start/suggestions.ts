export type SuggestionAction =
  | { type: "requirement"; text: string }
  | { type: "link"; href: string };

export interface Suggestion {
  id: string;
  title: string;
  detail: string;
  action: SuggestionAction;
}

export const SUGGESTIONS: Suggestion[] = [
  {
    id: "stripe-vs-adyen",
    title: "Why did we pick Stripe instead of Adyen?",
    detail: "Answered from the graph with citations (decision D-04).",
    action: { type: "requirement", text: "Why did we pick Stripe instead of Adyen?" },
  },
  {
    id: "zorblax-quillfruit",
    title: "Set up a Zorblax quillfruit trial in the flagship store",
    detail: "Unanswered on purpose — creates a crew task for an available agent.",
    action: { type: "requirement", text: "Set up a Zorblax quillfruit trial in the flagship store" },
  },
  {
    id: "media-storage-time-travel",
    title: "What did we believe on 1 Sep about media storage?",
    detail: "Time-travel Ask as of 1 Sep 2026.",
    action: { type: "link", href: "/ask?question=Why%20did%20we%20choose%20Amazon%20S3%20over%20MySQL%20for%20media%20storage%3F&asOf=2026-09-01" },
  },
  {
    id: "upload-document",
    title: "Upload a document and make it answerable",
    detail: "Plain-text files: .txt, .md, .json, .csv, .log.",
    action: { type: "link", href: "/ingest" },
  },
  {
    id: "review-proposals",
    title: "Review pending proposals",
    detail: "Human approval only — agents cannot approve.",
    action: { type: "link", href: "/review" },
  },
  {
    id: "open-sandbox",
    title: "Open a sandbox tenant",
    detail: "Own graph, expires after 24 hours.",
    action: { type: "link", href: "/sandbox" },
  },
];
