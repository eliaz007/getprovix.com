# Provix

**Automated code security and architectural auditing for Next.js and TypeScript repositories.**

Provix scans your codebase for structural anti-patterns and security vulnerabilities, tests its own patches behind the scenes, and opens clean, verified GitHub Pull Requests to fix them.

---

## Setup (environment)

1. **Copy the template** into a local env file (never commit secrets):

   ```bash
   cp .env.example .env.local
   ```

2. **Fill in credentials** in `.env.local`. Minimum for local auth/DB:

   | Variable | Where to get it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | [Supabase](https://supabase.com/dashboard) → Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → **anon** `public` key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Same page → **service_role** (server-only) |
   | `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally |
   | `GITHUB_APP_*` / `GITHUB_WEBHOOK_SECRET` | [GitHub Apps](https://github.com/settings/apps) (App ID, PEM, slug, OAuth client ID/secret, webhook secret) |
   | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
   | `RESEND_API_KEY` | [Resend](https://resend.com/api-keys) |
   | `STRIPE_SECRET_KEY` | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) |

   See `.env.example` for every supported variable (feature flags, PVIM shadow, PAT fallbacks).

3. **Install and run**:

   ```bash
   npm install
   npm run dev
   ```

   On boot, Provix logs a descriptive warning for any missing keys so you know exactly what to add — it does **not** crash the server just because optional integrations are unset.

---

## The Reliability-First Philosophy

Most automated refactoring tools operate on blind optimism: they guess a fix, open a broken PR, and leave your CI pipeline red.

Provix takes a different approach. **Reliability first, coverage second.**

### Key Features

* **Pre-Execution TypeScript Preflight:** Before any "Fix with PR" button is exposed, Provix runs a full TypeScript preflight check locally on the generated patch. If the patch doesn't compile cleanly, the button is hidden.
* **Zero False Breakages:** Complex or unfamiliar code shapes (such as custom `.or()`, `.delete()`, or raw SQL queries) are safely routed to **Manual Review** rather than risking a broken build.
* **CI Health Gate:** Built-in GitHub CI checks ensure that automated PRs are only unlocked when your repository's `main` branch is healthy and green.

---

## How It Works

1. **Scan:** Provix parses your Next.js/TypeScript repository for architectural debt and security flaws.
2. **Verify:** Generated AST patches undergo rigorous preflight validation against your local environment.
3. **Execute:** A clean, 100% preflight-tested Pull Request is opened instantly for you to merge with confidence.
