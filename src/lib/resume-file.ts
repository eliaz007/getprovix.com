export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_ACCEPT = ".pdf,.txt,.md,.text";
export const RESUME_TEXT_LIMIT = 16_000;

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".text"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/octet-stream",
]);

export function resumeFileExtension(filename: string): string {
  const match = filename.trim().toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

export function isPdfResume(filename: string, mimeType: string): boolean {
  const extension = resumeFileExtension(filename);
  const mime = mimeType.trim().toLowerCase();
  return extension === ".pdf" || mime === "application/pdf";
}

export function getResumeFileError(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!file.size) {
    return "The selected file is empty.";
  }

  if (file.size > RESUME_MAX_BYTES) {
    return "Resume must be 5 MB or smaller.";
  }

  const extension = resumeFileExtension(file.name);
  const mime = file.type.trim().toLowerCase();
  const isPdf = extension === ".pdf" || mime === "application/pdf";
  const isText = TEXT_EXTENSIONS.has(extension) || mime.startsWith("text/");

  if (!isPdf && !isText && !ALLOWED_MIME_TYPES.has(mime)) {
    return "Upload a PDF or text file (.pdf, .txt, or .md).";
  }

  return null;
}
