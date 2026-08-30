type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

export function isSupabaseSchemaError(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    (error.message?.includes("does not exist") ?? false) ||
    (error.message?.includes("Could not find the table") ?? false) ||
    (error.message?.includes("Could not find the") ?? false)
  );
}

export function schemaErrorMentionsColumn(
  error: { message?: string } | null | undefined,
  column: string
): boolean {
  const message = error?.message?.toLowerCase() ?? "";
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
  error: { message?: string } | null | undefined,
  columns: readonly string[]
): string | null {
  return (
    columns.find((column) => schemaErrorMentionsColumn(error, column)) ?? null
  );
}
