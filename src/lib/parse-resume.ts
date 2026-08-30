import { GoogleGenAI } from "@google/genai";
import {
  RESUME_TEXT_LIMIT,
  getResumeFileError,
  isPdfResume,
} from "@/lib/resume-file";

export {
  RESUME_ACCEPT,
  RESUME_MAX_BYTES,
  RESUME_TEXT_LIMIT,
  getResumeFileError,
} from "@/lib/resume-file";

function normalizeExtractedText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
}

function decodeTextBytes(bytes: Uint8Array): string {
  return normalizeExtractedText(
    new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  );
}

async function extractPdfWithUnpdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
  return normalizeExtractedText(text);
}

async function extractPdfWithGemini(bytes: Uint8Array): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Could not parse PDF and GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const base64 = Buffer.from(bytes).toString("base64");
  const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash"] as const;

  let lastError: unknown;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Extract all readable text from this resume. Return plain text only, preserving headings and bullet structure. Do not summarize.",
              },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: base64,
                },
              },
            ],
          },
        ],
        config: { temperature: 0 },
      });

      const text = normalizeExtractedText(response.text ?? "");
      if (text) {
        return text;
      }
    } catch (error) {
      lastError = error;
      console.error(`[parse-resume] Gemini PDF extract failed for ${model}:`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not extract text from this PDF.");
}

export async function extractResumeText(
  bytes: Uint8Array,
  filename: string,
  mimeType: string
): Promise<string> {
  let text = "";

  if (isPdfResume(filename, mimeType)) {
    try {
      text = await extractPdfWithUnpdf(bytes);
    } catch (error) {
      console.error("[parse-resume] unpdf extract failed:", error);
    }

    if (!text) {
      text = await extractPdfWithGemini(bytes);
    }
  } else {
    text = decodeTextBytes(bytes);
  }

  if (!text) {
    throw new Error("Could not read any text from that resume.");
  }

  return text.slice(0, RESUME_TEXT_LIMIT);
}

export async function extractResumeTextFromFile(file: File): Promise<string> {
  const error = getResumeFileError(file);
  if (error) {
    throw new Error(error);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return extractResumeText(bytes, file.name, file.type);
}
