export function getPublicProfileBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://www.getprovix.com"
  );
}

export function buildPublicProfileUrl(profileSlug: string): string {
  return `${getPublicProfileBaseUrl()}/p/${profileSlug}`;
}

export function buildPublicProfileUrlFromOrigin(
  profileSlug: string,
  origin: string
): string {
  return `${origin.replace(/\/$/, "")}/p/${profileSlug}`;
}
