import { extractText } from "unpdf";

export async function extractPdfText(bytes: Uint8Array | ArrayBuffer | ArrayLike<number>): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBufferLike);

  // Cheap guard: a real PDF starts with the %PDF- magic header.
  const head = new TextDecoder("latin1").decode(data.slice(0, 1024));
  if (!head.includes("%PDF-")) {
    throw new Error("Invalid or corrupt PDF: missing PDF header");
  }

  let result: { totalPages: number; text: string | string[] };
  try {
    result = await extractText(data, { mergePages: true });
  } catch (e) {
    throw new Error(`Invalid or corrupt PDF: ${(e as Error)?.message ?? String(e)}`);
  }

  const text = Array.isArray(result.text) ? result.text.join("\n") : String(result.text ?? "");
  if (!text.trim()) {
    throw new Error("No extractable text in this PDF — it may be scanned or image-only; OCR is not supported");
  }
  return text;
}

export default extractPdfText;
