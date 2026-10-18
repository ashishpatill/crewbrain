import { describe, it, expect } from "vitest";
import { extractPdfText } from "../apps/web/lib/pdf";

function buildPdf(contentStream: string): Uint8Array {
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  function addObj(num: number, body: string) {
    offsets[num] = pdf.length;
    pdf += `${num} 0 obj\n${body}\nendobj\n`;
  }

  addObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObj(
    3,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  );
  addObj(4, `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);
  addObj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const xrefOffset = pdf.length;
  pdf += "xref\n";
  pdf += `0 ${offsets.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += "trailer\n";
  pdf += `<< /Size ${offsets.length} /Root 1 0 R >>\n`;
  pdf += "startxref\n";
  pdf += `${xrefOffset}\n`;
  pdf += "%%EOF\n";

  return new TextEncoder().encode(pdf);
}

function makeTextPdf(text: string): Uint8Array {
  const content = `BT /F1 12 Tf 100 700 Td (${text.replace(/[()\\]/g, (c) => "\\" + c)}) Tj ET`;
  return buildPdf(content);
}

function makeScannedPdf(): Uint8Array {
  // A page with an image XObject draw and no text operators.
  // Simpler: empty content stream (valid page, no extractable text).
  return buildPdf("");
}

describe("pdf text extraction", () => {
  it("extracts text from a text PDF", async () => {
    const bytes = makeTextPdf("Hello Crewbrain PDF");
    const text = await extractPdfText(bytes);
    expect(text).toContain("Hello Crewbrain PDF");
  });

  it("rejects a scanned/image-only PDF with no extractable text", async () => {
    const bytes = makeScannedPdf();
    await expect(extractPdfText(bytes)).rejects.toThrow(/No extractable text/i);
  });

  it("rejects non-PDF input", async () => {
    const bytes = new TextEncoder().encode("this is not a pdf");
    await expect(extractPdfText(bytes)).rejects.toThrow();
  });

  it("rejects corrupt PDF input", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\ngarbage");
    await expect(extractPdfText(bytes)).rejects.toThrow();
  });
});
