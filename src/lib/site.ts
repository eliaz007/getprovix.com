import type { Metadata } from "next";

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
  "https://www.getprovix.com";

export const SITE_NAME = "Provix";
export const SITE_TITLE = "Provix — Verified Candidate Intelligence";
export const SITE_DESCRIPTION =
  "Provix verifies engineering talent with proof-of-work screening, AI GitHub audits, repository integrity analysis, and candidate scoring for technical hiring.";
export const SITE_EMAIL = "support@getprovix.com";
export const SITE_LOGO_URL = `${SITE_URL}/logo.svg`;

export const SITE_KEYWORDS = [
  "Provix",
  "verified candidate intelligence",
  "proof-of-work screening",
  "GitHub auditor",
  "developer hiring",
  "technical recruiting",
  "repository integrity analysis",
  "candidate scoring",
  "engineering talent marketplace",
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
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
    },
  };
}
