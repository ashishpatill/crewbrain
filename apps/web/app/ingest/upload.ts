export const SUPPORTED_UPLOAD_EXTS = [".txt", ".md", ".json", ".csv", ".log", ".pdf"] as const;
export const MAX_UPLOAD_BYTES = 512 * 1024;

export function isSupportedUpload(name: string): boolean {
  const lower = (name || "").toLowerCase();
  return SUPPORTED_UPLOAD_EXTS.some((ext) => lower.endsWith(ext));
}

export interface UploadValidation {
  ok: boolean;
  valid: boolean;
  error?: string;
  message?: string;
}

export function validateUploadFile(name: string, sizeBytes: number): UploadValidation {
  if (!isSupportedUpload(name)) {
    const msg = `Unsupported file type. Supported types: ${SUPPORTED_UPLOAD_EXTS.join(", ")}. DOCX is not supported yet (PDF now is).`;
    return { ok: false, valid: false, error: msg, message: msg };
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    const msg = `File too large: ${sizeBytes} bytes exceeds ${MAX_UPLOAD_BYTES} bytes maximum.`;
    return { ok: false, valid: false, error: msg, message: msg };
  }
  return { ok: true, valid: true };
}
