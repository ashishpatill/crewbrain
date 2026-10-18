import { MAX_UPLOAD_BYTES } from "../../../ingest/upload";
import { extractPdfText } from "../../../ingest/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") || "";
    let bytes: Uint8Array;

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = (form.get("file") ?? form.get("pdf") ?? form.get("upload")) as File | null;
      if (!(file instanceof File)) {
        return Response.json({ error: "file required" }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return Response.json(
          { error: `File too large: ${file.size} bytes exceeds ${MAX_UPLOAD_BYTES} bytes maximum.` },
          { status: 413 },
        );
      }
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const buf = await req.arrayBuffer();
      bytes = new Uint8Array(buf);
    }

    if (bytes.length === 0) {
      return Response.json({ error: "empty file" }, { status: 400 });
    }
    if (bytes.length > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `File too large: ${bytes.length} bytes exceeds ${MAX_UPLOAD_BYTES} bytes maximum.` },
        { status: 413 },
      );
    }

    const text = await extractPdfText(bytes);
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
