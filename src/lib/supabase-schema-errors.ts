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
