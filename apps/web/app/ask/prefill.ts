export function parseAskPrefill(params: URLSearchParams): { question?: string; asOfDate?: string } {
  const question = params.get("question");
  const asOf = params.get("asOf");
  const result: { question?: string; asOfDate?: string } = {};
  if (question) result.question = question;
  if (asOf) result.asOfDate = asOf;
  return result;
}
