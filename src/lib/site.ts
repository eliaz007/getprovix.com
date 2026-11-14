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
/** Home page / social-share title. The root layout uses `title.default`, so this
 *  must include the brand and read as a complete standalone title. */
export const SITE_TITLE = "Automated Security for Next.js and Supabase | Provix";
/** Social titles are rendered verbatim (no `| Provix` template applied), so the
 *  brand suffix is stripped here to avoid "| Provix | Provix". */
export const SITE_SOCIAL_TITLE = SITE_TITLE.replace(
  new RegExp(`\\s*\\|\\s*${SITE_NAME}$`),
  ""
);
export const SITE_DESCRIPTION =
  "Provix scans your Next.js, TypeScript, and Supabase repo for security bugs and opens a Pull Request with the fix—checked with tsc so it won't break your build. Code is scanned in memory, never stored, and never used to train AI models.";
export const SITE_EMAIL = "support@getprovix.com";
export const SITE_LOGO_URL = `${SITE_URL}/logo.svg`;
/** Social share image — `src/app/opengraph-image.png` (1200×630, 1.91:1), the
 *  same asset Next.js serves from the file convention for routes that inherit
 *  root metadata. Pages that declare their own `openGraph` replace the parent
 *  object wholesale (dropping the inherited image), so `buildPageMetadata`
 *  references this path explicitly to keep one image site-wide. Next.js still
 *  emits a hashed URL for the file-convention routes. */
export const SITE_OG_IMAGE_PATH = "/opengraph-image.png";

export const SITE_KEYWORDS = [
  "Provix",
  "architecture firewall",
  "GitHub security scan",
  "secret leak detection",
  "client database exposure",
  "autofix pull request",
  "TypeScript repository scanner",
  "Next.js security",
  "Supabase security",
  "Supabase service role key leak",
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
    // A page-level `openGraph` object replaces the parent's wholesale, which
    // would drop the image inherited from `src/app/opengraph-image.png`. Point
    // at that file explicitly so every page keeps one shared image instead of
    // drifting per-page copies.
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      siteName: SITE_NAME,
      title: socialTitle,
      description,
      images: [SITE_OG_IMAGE_PATH],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [SITE_OG_IMAGE_PATH],
    },
  };
}
