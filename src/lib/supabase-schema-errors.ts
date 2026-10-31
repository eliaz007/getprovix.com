/** Structural match for Supabase `PostgrestError` (and unknown query errors). */
export type PostgrestErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function readStringField(record: object, key: string): string | undefined {
  if (!(key in record)) {
    return undefined;
  }
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Narrow unknown Supabase / PostgREST error values without assuming a class
 * instance. Safe for both real `PostgrestError` and preflight stubs.
 */
export function asPostgrestErrorLike(error: unknown): PostgrestErrorLike | null {
  if (error == null) {
    return null;
  }
  if (typeof error !== "object") {
    return { message: String(error) };
  }

  const message = readStringField(error, "message") ?? readStringField(error, "msg");
  const details = readStringField(error, "details");
  const hint = readStringField(error, "hint");
  const code = readStringField(error, "code");

  if (message == null && details == null && hint == null && code == null) {
    return null;
  }

  return { message, details, hint, code };
}

export function isSupabaseSchemaError(error: unknown): boolean {
  const normalized = asPostgrestErrorLike(error);
  if (!normalized) {
    return false;
  }

  return (
    normalized.code === "42P01" ||
    normalized.code === "42703" ||
    normalized.code === "PGRST204" ||
    normalized.code === "PGRST205" ||
    (normalized.message?.includes("does not exist") ?? false) ||
    (normalized.message?.includes("Could not find the table") ?? false) ||
    (normalized.message?.includes("Could not find the") ?? false)
  );
}

export function schemaErrorMentionsColumn(
  error: unknown,
  column: string
): boolean {
  const message = asPostgrestErrorLike(error)?.message?.toLowerCase() ?? "";
  const name = column.trim().toLowerCase();
  if (!message || !name) {
    return false;
  }

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`).test(
    message
  );
}

export function findMentionedColumn(
  error: unknown,
  columns: readonly string[]
): string | null {
  return (
    columns.find((column) => schemaErrorMentionsColumn(error, column)) ?? null
  );
}
