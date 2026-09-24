"use client";

import { Analytics } from "@vercel/analytics/react";

/** Client-only so analytics never participates in the HTML response. */
export default function VercelAnalytics() {
  return <Analytics />;
}
