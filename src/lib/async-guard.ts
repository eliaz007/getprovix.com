/** Run an async operation; on throw, log and return a fallback. */
export async function withLoggedFallback<T>(
  label: string,
  run: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[${label}]`, error);
    return fallback;
  }
}

/** Run an async operation; on throw, log and return null. */
export async function withLoggedNull<T>(
  label: string,
  run: () => Promise<T>
): Promise<T | null> {
  return withLoggedFallback(label, run, null);
}
