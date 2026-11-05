import type { Metadata } from "next";

/** Prefer apex getprovix.com — strip www so email/canonical links stay consistent. */
export function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.replace(/\/$/, "");
  try {
    const url = new URL(trimmed);
    if (url.hostname === "www.getprovix.com") {
      url.hostname = "getprovix.com";
      return url.origin;
    }
  } catch {
    // fall through
  }
  return trimmed;
}

export const SITE_URL = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_APP_URL ?? "https://getprovix.com"
);

export const SITE_NAME = "Provix";
export const SITE_TITLE = "Provix — Architecture Firewall for GitHub";
export const SITE_DESCRIPTION =
  "Connect a GitHub repo, scan for secrets, client database exposure, and architecture issues, then open fix pull requests from one workspace.";
export const SITE_EMAIL = "support@getprovix.com";
export const SITE_LOGO_URL = `${SITE_URL}/logo.svg`;
/** Social share image — drop the file at `public/og.jpg` (1200×630 recommended). */
export const SITE_OG_IMAGE_PATH = "/og.jpg";
export const SITE_OG_IMAGE_URL = `${SITE_URL}${SITE_OG_IMAGE_PATH}`;
export const SITE_OG_IMAGE = {
  url: SITE_OG_IMAGE_PATH,
  width: 1200,
  height: 675,
  alt: `${SITE_NAME} — Architecture Firewall for GitHub`,
} as const;

export const SITE_KEYWORDS = [
  "Provix",
  "architecture firewall",
  "GitHub security scan",
  "secret leak detection",
  "client database exposure",
  "autofix pull request",
  "TypeScript repository scanner",
  "Next.js security",
];

export function buildPageMetadata(
  title: string,
  description: string,
  path: string
): Metadata {
  const url = path.startsWith("http") ? path : `${SITE_URL}${path}`;
  const socialTitle = `${title} | ${SITE_NAME}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      siteName: SITE_NAME,
      title: socialTitle,
      description,
      images: [SITE_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [SITE_OG_IMAGE_PATH],
    },
  };
}
