export class NonJsonResponseError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NonJsonResponseError";
    this.status = status;
  }
}

function isJsonContentType(contentType: string): boolean {
  return (
    contentType.includes("application/json") ||
    contentType.includes("+json") ||
    contentType.includes("application/problem+json")
  );
}

/**
 * Parse a fetch Response as JSON without treating an HTML error page as JSON.
 * Redirects to `/` (200 HTML) and Next.js 404/500 pages throw a clear error
 * instead of `Unexpected token '<'`.
 */
export async function readJsonResponse<T = unknown>(
  response: Response
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!isJsonContentType(contentType)) {
    throw new NonJsonResponseError(
      response.redirected || response.ok
        ? "The server returned a page instead of JSON."
        : `Request failed (${response.status || "network"}).`,
      response.status
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new NonJsonResponseError(
      "The server returned invalid JSON.",
      response.status
    );
  }
}
