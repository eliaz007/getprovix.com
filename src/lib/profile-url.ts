import { SITE_URL } from "@/lib/site";

export function getPublicProfileBaseUrl(): string {
  return SITE_URL;
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
