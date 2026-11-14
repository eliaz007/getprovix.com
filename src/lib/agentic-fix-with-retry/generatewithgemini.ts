import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { finalizeAutofixWrites, type AutofixWriteFile } from "@/lib/autofix-write-validation";
import {
  mergeServerAction,
  SECRET_RULE_CATALOG,
  serverActionFilePath,
  type SecurityFixLayout,
} from "@/lib/scanner/security-suite";
import { MODELS } from "./models";
import { systemInstruction } from "./systeminstruction";

export async function generateWithGemini(prompt: string, system: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const ai = new GoogleGenAI({ apiKey });
  let last: unknown;
  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          temperature: 0,
        },
      });
      const text = response.text?.trim();
      if (!text) throw new Error(`Gemini (${model}) returned an empty response.`);
      return text;
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("Gemini request failed.");
}
