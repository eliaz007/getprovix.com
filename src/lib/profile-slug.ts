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

export function buildUniqueProfileSlug(
  name: string | null | undefined,
  userId: string,
  fallback = "builder"
): string {
  const base = buildProfileSlug(name, fallback);
  const suffix = userId.replace(/-/g, "").slice(0, 8).toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}

export function normalizeProfileSlug(
  slug: string | null | undefined
): string {
  return buildProfileSlug(slug, "");
}
