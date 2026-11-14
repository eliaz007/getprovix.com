import { describe, expect, it } from "vitest";
import { buildProvixHealPullRequestHeader } from "@/lib/github-autofix-pr";

const STATIC_VERIFICATION =
  "`✅ AST Syntax Verified` | `✅ tsc --noEmit Passed` | `✅ Post-Security Re-scanned`";

describe("buildProvixHealPullRequestHeader", () => {
  it("emits the exact standardized 3-line header with dynamic vulnerability and fix", () => {
    const body = buildProvixHealPullRequestHeader(
      "A client component queries the database directly. Move it behind auth.",
      "Moved the client-side database query behind an authenticated server action"
    );

    expect(body).toBe(
      [
        "### 🛡️ Provix Automated Security & Architecture Heal",
        "- **The Vulnerability:** A client component queries the database directly.",
        "- **The Fix:** Moved the client-side database query behind an authenticated server action.",
        `- **Verification:** ${STATIC_VERIFICATION}`,
      ].join("\n")
    );
  });

  it("keeps verification badges static and collapses multi-sentence AST text", () => {
    const body = buildProvixHealPullRequestHeader(
      "Stripe live secret key is exposed in source. Rotate it first. Then store the replacement.",
      "Redacted the secret and referenced process.env.STRIPE_SECRET_KEY instead!"
    );

    const lines = body.split("\n");
    expect(lines[0]).toBe("### 🛡️ Provix Automated Security & Architecture Heal");
    expect(lines[1]).toBe(
      "- **The Vulnerability:** Stripe live secret key is exposed in source."
    );
    expect(lines[2]).toBe(
      "- **The Fix:** Redacted the secret and referenced process.env.STRIPE_SECRET_KEY instead!"
    );
    expect(lines[3]).toBe(`- **Verification:** ${STATIC_VERIFICATION}`);
    expect(body).toContain(STATIC_VERIFICATION);
    expect(body.match(/✅/g)).toHaveLength(3);
  });

  it("uses fallbacks when vulnerability or fix text is blank", () => {
    const body = buildProvixHealPullRequestHeader("   ", "");
    expect(body).toContain(
      "- **The Vulnerability:** An AST security or architecture finding was detected."
    );
    expect(body).toContain(
      "- **The Fix:** Applied a surgical patch for the reported finding."
    );
    expect(body).toContain(`- **Verification:** ${STATIC_VERIFICATION}`);
  });
});
