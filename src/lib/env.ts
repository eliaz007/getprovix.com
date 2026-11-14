/**
 * Runtime environment validation for Provix.
 *
 * Missing keys log descriptive warnings instead of crashing the server, so
 * local `next dev` still boots while developers know exactly what to add to
 * `.env.local`.
 */

export type EnvRequirement = "required" | "optional";

export type EnvVarSpec = {
  name: string;
  group: string;
  requirement: EnvRequirement;
  description: string;
  /** Where to obtain the credential / how to set it. */
  where: string;
  /** Optional accepted values hint (feature flags). */
  example?: string;
};

/**
 * Every application-owned env var discovered via `process.env` access
 * (excludes platform-injected `NODE_ENV` / `VERCEL_URL`).
 */
export const ENV_SPECS: readonly EnvVarSpec[] = [
  {
    name: "NEXT_PUBLIC_APP_URL",
    group: "App",
    requirement: "optional",
    description: "Public site origin for OAuth redirects, emails, and checkout return URLs.",
    where: "Set to http://localhost:3000 locally, or your deployed HTTPS origin.",
    example: "http://localhost:3000",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    group: "Supabase",
    requirement: "required",
    description: "Supabase project URL used by browser, middleware, and server clients.",
    where: "Supabase Dashboard → Project Settings → API → Project URL",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    group: "Supabase",
    requirement: "required",
    description: "Supabase anon (public) key for authenticated user sessions.",
    where: "Supabase Dashboard → Project Settings → API → anon public",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    group: "Supabase",
    requirement: "optional",
    description: "Server-only service role key for admin / privileged DB operations.",
    where: "Supabase Dashboard → Project Settings → API → service_role (secret)",
  },
  {
    name: "GITHUB_APP_ID",
    group: "GitHub App",
    requirement: "optional",
    description: "Numeric GitHub App ID used to mint installation tokens.",
    where: "GitHub → Settings → Developer settings → GitHub Apps → App ID",
  },
  {
    name: "GITHUB_APP_PRIVATE_KEY",
    group: "GitHub App",
    requirement: "optional",
    description: "PEM private key for GitHub App JWT authentication.",
    where: "GitHub App settings → Private keys → Generate / download (.pem)",
  },
  {
    name: "GITHUB_APP_SLUG",
    group: "GitHub App",
    requirement: "optional",
    description: "App slug used in install URLs (github.com/apps/<slug>).",
    where: "GitHub App settings → Public link / apps/<slug>",
  },
  {
    name: "GITHUB_APP_CLIENT_ID",
    group: "GitHub App",
    requirement: "optional",
    description: "OAuth client ID for user-to-server GitHub App authorization.",
    where: "GitHub App settings → Client ID",
  },
  {
    name: "GITHUB_APP_CLIENT_SECRET",
    group: "GitHub App",
    requirement: "optional",
    description: "OAuth client secret for exchanging GitHub App authorization codes.",
    where: "GitHub App settings → Client secrets",
  },
  {
    name: "GITHUB_APP_REDIRECT_ORIGIN",
    group: "GitHub App",
    requirement: "optional",
    description: "Optional origin override when OAuth callback differs from NEXT_PUBLIC_APP_URL.",
    where: "Usually leave blank; set only if redirect_uri must use a different origin.",
  },
  {
    name: "GITHUB_WEBHOOK_SECRET",
    group: "GitHub App",
    requirement: "optional",
    description: "Shared secret used to verify GitHub webhook signatures.",
    where: "GitHub App settings → Webhook → Secret",
  },
  {
    name: "GITHUB_TOKEN",
    group: "GitHub tokens",
    requirement: "optional",
    description: "Personal access token fallback when App installation tokens are unavailable.",
    where: "GitHub → Settings → Developer settings → Personal access tokens",
  },
  {
    name: "GITHUB_PAT",
    group: "GitHub tokens",
    requirement: "optional",
    description: "Alternate PAT env name (used if GITHUB_TOKEN is empty).",
    where: "Same as GITHUB_TOKEN; only one of the two is needed.",
  },
  {
    name: "GEMINI_API_KEY",
    group: "Google Gemini",
    requirement: "optional",
    description: "API key for audit, match, screening, and agentic autofix routes.",
    where: "https://aistudio.google.com/apikey",
  },
  {
    name: "RESEND_API_KEY",
    group: "Resend",
    requirement: "optional",
    description: "API key for transactional email (intros, verification, job alerts).",
    where: "https://resend.com/api-keys",
  },
  {
    name: "STRIPE_SECRET_KEY",
    group: "Stripe",
    requirement: "optional",
    description: "Secret key for Checkout sessions (candidate unlock payments).",
    where: "https://dashboard.stripe.com/apikeys",
  },
  {
    name: "PROVIX_AGENTIC_CLIENT_DB",
    group: "Feature flags",
    requirement: "optional",
    description: "Enables agentic client-database autofix paths when set to 1.",
    where: "Add to .env.local only when testing agentic client-DB fixes.",
    example: "1",
  },
  {
    name: "PROVIX_AUTONOMOUS_WEBHOOK_HEAL",
    group: "Feature flags",
    requirement: "optional",
    description: "Enables autonomous webhook heal when set to true.",
    where: "Add to .env.local / production only when webhook heal should run.",
    example: "true",
  },
  {
    name: "PVIM_SHADOW_ENABLED",
    group: "PVIM shadow",
    requirement: "optional",
    description: "Enables the PVIM shadow scanner when set to true.",
    where: "Requires PVIM_SHADOW_URL and PVIM_SERVICE_TOKEN as well.",
    example: "true",
  },
  {
    name: "PVIM_SHADOW_URL",
    group: "PVIM shadow",
    requirement: "optional",
    description: "Base HTTP(S) URL for the PVIM shadow analysis service.",
    where: "Provided by your PVIM deployment / operator.",
  },
  {
    name: "PVIM_SERVICE_TOKEN",
    group: "PVIM shadow",
    requirement: "optional",
    description: "Bearer token for authenticating to the PVIM shadow service.",
    where: "Provided by your PVIM deployment / operator (server-only).",
  },
  {
    name: "PVIM_SHADOW_TIMEOUT_MS",
    group: "PVIM shadow",
    requirement: "optional",
    description: "Optional PVIM request timeout in milliseconds (default 10000).",
    where: "Leave blank to use the default timeout.",
    example: "10000",
  },
] as const;

export type EnvName = (typeof ENV_SPECS)[number]["name"];

export type EnvCheckResult = {
  name: string;
  group: string;
  requirement: EnvRequirement;
  present: boolean;
  description: string;
  where: string;
  example?: string;
};

function isPresent(name: string): boolean {
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim().length > 0;
}

/** Read a known env var (trimmed). Returns undefined when missing/blank. */
export function getEnv(name: EnvName | string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Snapshot every declared env var and whether it is currently set. */
export function checkEnv(): EnvCheckResult[] {
  return ENV_SPECS.map((spec) => ({
    name: spec.name,
    group: spec.group,
    requirement: spec.requirement,
    present: isPresent(spec.name),
    description: spec.description,
    where: spec.where,
    example: spec.example,
  }));
}

export type ValidateEnvResult = {
  ok: boolean;
  missingRequired: EnvCheckResult[];
  missingOptional: EnvCheckResult[];
  present: EnvCheckResult[];
};

/** Validate declared env vars without throwing. */
export function validateEnv(): ValidateEnvResult {
  const results = checkEnv();
  const missingRequired = results.filter((r) => r.requirement === "required" && !r.present);
  const missingOptional = results.filter((r) => r.requirement === "optional" && !r.present);
  const present = results.filter((r) => r.present);
  return {
    ok: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    present,
  };
}

function formatMissingLine(item: EnvCheckResult): string {
  const example = item.example ? ` (e.g. ${item.example})` : "";
  return [
    `  • ${item.name}${example}`,
    `      ${item.description}`,
    `      Add to .env.local → ${item.where}`,
  ].join("\n");
}

let hasWarned = false;

/**
 * Log a clean, descriptive warning for missing env keys.
 * Safe to call multiple times; only prints once per process.
 * Never throws — local testing should still boot.
 */
export function warnMissingEnv(options?: { includeOptional?: boolean }): ValidateEnvResult {
  const result = validateEnv();
  const includeOptional = options?.includeOptional ?? true;

  if (hasWarned) return result;
  hasWarned = true;

  const sections: string[] = [];

  if (result.missingRequired.length > 0) {
    sections.push(
      [
        "[env] Missing REQUIRED variables — core auth/DB features will fail until you add them to .env.local:",
        ...result.missingRequired.map(formatMissingLine),
      ].join("\n")
    );
  }

  if (includeOptional && result.missingOptional.length > 0) {
    const byGroup = new Map<string, EnvCheckResult[]>();
    for (const item of result.missingOptional) {
      const list = byGroup.get(item.group) ?? [];
      list.push(item);
      byGroup.set(item.group, list);
    }

    const groupBlocks = [...byGroup.entries()].map(([group, items]) =>
      [`  [${group}]`, ...items.map(formatMissingLine)].join("\n")
    );

    sections.push(
      [
        "[env] Optional variables not set (related features stay disabled until configured):",
        ...groupBlocks,
      ].join("\n")
    );
  }

  if (sections.length === 0) {
    console.info(
      `[env] All ${ENV_SPECS.length} declared environment variables are present.`
    );
    return result;
  }

  console.warn(
    [
      "",
      "══════════════════════════════════════════════════════════════════",
      " Provix environment check",
      " Copy .env.example → .env.local, then fill in the keys below.",
      "══════════════════════════════════════════════════════════════════",
      ...sections,
      "",
      " Tip: restart `npm run dev` after editing .env.local.",
      "══════════════════════════════════════════════════════════════════",
      "",
    ].join("\n")
  );

  return result;
}

/** Test helper — allow re-running warnings after env mutations. */
export function resetEnvWarningState(): void {
  hasWarned = false;
}
