/**
 * Next.js server bootstrap hook.
 * Warns about missing .env.local keys without blocking startup.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { warnMissingEnv } = await import("@/lib/env");
  warnMissingEnv({ includeOptional: true });
}
