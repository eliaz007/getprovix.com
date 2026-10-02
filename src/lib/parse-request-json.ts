import { NextResponse } from "next/server";
import { z } from "zod";

export type ParsedJsonBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/** Parse and validate a JSON request body with Zod. Invalid JSON or schema → 400. */
export async function parseJsonWithSchema<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<ParsedJsonBody<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid JSON body.",
          details: ["Request body must be valid JSON."],
        },
        { status: 400 }
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid request payload.",
          details: parsed.error.issues.map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join(".") : "body";
            return `${path}: ${issue.message}`;
          }),
        },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

export function formatZodErrorDetails(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "body";
    return `${path}: ${issue.message}`;
  });
}
