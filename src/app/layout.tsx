import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import {
  SITE_DESCRIPTION,
  SITE_EMAIL,
  SITE_KEYWORDS,
  SITE_LOGO_URL,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";
import { PUBLIC_PLACEMENT_TERMS_SUMMARY } from "@/lib/placement-terms";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#0B0B0D",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "technology",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  other: {
    "color-scheme": "dark",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      legalName: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: SITE_LOGO_URL,
        width: 512,
        height: 512,
      },
      image: SITE_LOGO_URL,
      email: SITE_EMAIL,
      description: SITE_DESCRIPTION,
      contactPoint: {
        "@type": "ContactPoint",
        email: SITE_EMAIL,
        contactType: "customer support",
        url: SITE_URL,
        availableLanguage: "English",
      },
      knowsAbout: [
        "Candidate screening",
        "Proof-of-work verification",
        "GitHub repository analysis",
        "Technical recruiting",
        "Engineering talent matching",
      ],
    },
    {
      "@type": ["SoftwareApplication", "WebApplication"],
      "@id": `${SITE_URL}/#software`,
      name: SITE_NAME,
      url: SITE_URL,
      image: SITE_LOGO_URL,
      description:
        "Provix is a developer screening platform that replaces bloated resumes with verified proof of work, automated GitHub auditing, repository integrity analysis, and structured candidate profiles for technical hiring.",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Recruiting software",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript. Requires HTML5.",
      inLanguage: "en-US",
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        description:
          "Free during beta for profile browsing and AI screening. " +
          PUBLIC_PLACEMENT_TERMS_SUMMARY,
      },
      featureList:
        "Verified candidate profiles with proof-of-work signals, AI Code & Resume Auditor, repository integrity analysis, candidate scoring and talent matching, Pitch Studio outreach generation, warm employer introductions",
      publisher: { "@id": `${SITE_URL}/#organization` },
      provider: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en-US",
      publisher: { "@id": `${SITE_URL}/#organization` },
      about: { "@id": `${SITE_URL}/#software` },
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
