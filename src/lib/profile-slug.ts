export function buildProfileSlug(
  name: string | null | undefined,
  fallback = "builder"
): string {
  const slug = (name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || fallback;
}

export function normalizeProfileSlug(
  slug: string | null | undefined
): string {
  return buildProfileSlug(slug, "");
}
