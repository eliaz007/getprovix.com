import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf"],
  // tsc loads lib/*.d.ts by filesystem path. NFT does not follow that, so the
  // serverless bundle otherwise skips preflight on Vercel. Same for @types/react:
  // `react` is traced as a runtime dep, but its declarations stay in devDependencies.
  outputFileTracingIncludes: {
    "/api/firewall/autofix/pr": [
      "./node_modules/typescript/lib/**/*",
      "./node_modules/@types/react/**/*",
      "./node_modules/@types/react-dom/**/*",
    ],
    "/api/webhooks/github": [
      "./node_modules/typescript/lib/**/*",
      "./node_modules/@types/react/**/*",
      "./node_modules/@types/react-dom/**/*",
    ],
  },
  async redirects() {
    return [
      {
        // Supabase Site URL fallback delivers the PKCE code to /?code=.
        // Query params are forwarded, so /auth/callback can exchange the session.
        source: "/",
        has: [{ type: "query", key: "code" }],
        destination: "/auth/callback",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
