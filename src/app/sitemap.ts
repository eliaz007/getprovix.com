import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { path: "", changeFrequency: "weekly" as const, priority: 1 },
    { path: "/onboarding", changeFrequency: "weekly" as const, priority: 0.9 },
    { path: "/firewall", changeFrequency: "weekly" as const, priority: 0.9 },
    { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/login", changeFrequency: "monthly" as const, priority: 0.5 },
  ].map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path || "/"}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
