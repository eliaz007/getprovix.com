import { describe, expect, it } from "vitest";
import {
  captureOriginalSecurityFinding,
  findingMatchesOriginal,
  verifySecurityFixResolved,
  type PostFixVerifyTarget,
} from "@/lib/post-fix-security-verify";
import type { SecurityFinding } from "@/lib/scanner/security-suite";

const stripe = `sk_live_${"b".repeat(24)}`;

function secretFinding(overrides?: Partial<SecurityFinding>): SecurityFinding {
  return {
    filePath: "src/lib/pay.ts",
    severity: "CRITICAL",
    rule: "Hardcoded Secret",
    category: "SECRET_LEAK",
    line: 1,
    message:
      "Stripe live secret key is exposed in source. Rotate or revoke it first — moving it to STRIPE_SECRET_KEY " +
      "does not invalidate the leaked credential. Store the replacement in the deployment " +
      "environment. If this value was committed or pushed, scrub Git history " +
      "(rewriting history affects collaborators). Provix does not rotate credentials or rewrite history.",
    snippet: `const key = "sk_live_...${"b".repeat(4)}";`,
    remediation: {
      diff: "",
      envExample: "STRIPE_SECRET_KEY=",
      command: "rotate",
    },
    ...overrides,
  };
}

describe("verifySecurityFixResolved", () => {
  it("fails closed when the original secret is still present", () => {
    const original: PostFixVerifyTarget = {
      category: "SECRET_LEAK",
      filePath: "src/lib/pay.ts",
      line: 1,
      message: secretFinding().message,
      snippet: `const key = "${stripe}";`,
    };
    const result = verifySecurityFixResolved(original, [
      { filePath: "src/lib/pay.ts", content: `export const key = "${stripe}";\n` },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("still-present");
      expect(result.message).toMatch(/still present/i);
      expect(result.message).toMatch(/pull request was not opened/i);
    }
  });

  it("passes when the secret was removed from the patched files", () => {
    const original: PostFixVerifyTarget = {
      category: "SECRET_LEAK",
      filePath: "src/lib/pay.ts",
      line: 1,
      message: secretFinding().message,
      snippet: `const key = "${stripe}";`,
    };
    const result = verifySecurityFixResolved(original, [
      {
        filePath: "src/lib/pay.ts",
        content: 'export const key = process.env.STRIPE_SECRET_KEY;\n',
      },
      { filePath: ".env.example", content: "STRIPE_SECRET_KEY=\n" },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("does not block on an unrelated finding of the same category", () => {
    const original: PostFixVerifyTarget = {
      category: "SECRET_LEAK",
      filePath: "src/lib/pay.ts",
      line: 1,
      message: secretFinding().message,
      snippet: `const key = "${stripe}";`,
    };
    const openai = `sk-proj-${"a".repeat(24)}`;
    const result = verifySecurityFixResolved(
      original,
      [{ filePath: "src/lib/other.ts", content: `export const key = "${openai}";\n` }],
      {
        scan: () => [
          secretFinding({
            filePath: "src/lib/other.ts",
            message:
              "OpenAI API key is exposed in source. Rotate or revoke it first — moving it to OPENAI_API_KEY " +
              "does not invalidate the leaked credential. Store the replacement in the deployment " +
              "environment. If this value was committed or pushed, scrub Git history " +
              "(rewriting history affects collaborators). Provix does not rotate credentials or rewrite history.",
            snippet: `export const key = "${openai}";`,
            remediation: {
              diff: "",
              envExample: "OPENAI_API_KEY=",
              command: "rotate",
            },
          }),
        ],
      }
    );
    expect(result).toEqual({ ok: true });
  });

  it("fails closed when the scanner throws", () => {
    const original: PostFixVerifyTarget = {
      category: "SECRET_LEAK",
      filePath: "src/lib/pay.ts",
      line: 1,
      message: secretFinding().message,
      snippet: stripe,
    };
    const result = verifySecurityFixResolved(
      original,
      [{ filePath: "src/lib/pay.ts", content: "export {};\n" }],
      {
        scan: () => {
          throw new Error("scanner exploded");
        },
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("scan-failed");
      expect(result.message).toMatch(/could not complete/i);
      expect(result.message).toMatch(/scanner exploded/);
    }
  });

  it("fails closed when no patched files are provided", () => {
    const original: PostFixVerifyTarget = {
      category: "SECRET_LEAK",
      filePath: "src/lib/pay.ts",
      line: 1,
    };
    const result = verifySecurityFixResolved(original, []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("scan-failed");
      expect(result.message).toMatch(/no patched files/i);
    }
  });

  it("fails closed when the scanner returns a non-array", () => {
    const original: PostFixVerifyTarget = {
      category: "CLIENT_DB_EXPOSURE",
      filePath: "src/components/profiles.tsx",
      line: 3,
      snippet: 'supabase.from("profiles")',
    };
    const result = verifySecurityFixResolved(
      original,
      [{ filePath: "src/components/profiles.tsx", content: "export {};\n" }],
      {
        // @ts-expect-error intentional invalid scanner contract
        scan: () => null,
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("scan-failed");
      expect(result.message).toMatch(/invalid scanner result/i);
    }
  });
});

describe("findingMatchesOriginal", () => {
  it("matches secrets by label from the original message", () => {
    const original: PostFixVerifyTarget = {
      category: "SECRET_LEAK",
      filePath: "src/lib/pay.ts",
      line: 1,
      message: secretFinding().message,
    };
    expect(findingMatchesOriginal(original, secretFinding())).toBe(true);
  });

  it("matches client queries by table fingerprint", () => {
    const original: PostFixVerifyTarget = {
      category: "CLIENT_DB_EXPOSURE",
      filePath: "src/components/profiles.tsx",
      line: 3,
      snippet: "supabase.from('profiles').select('*')",
    };
    const residual: SecurityFinding = {
      filePath: "src/components/profiles.tsx",
      severity: "HIGH",
      rule: "Client DB",
      category: "CLIENT_DB_EXPOSURE",
      line: 4,
      message: "client query",
      snippet: "await supabase.from('profiles').select('id')",
      remediation: { diff: "", command: "" },
    };
    expect(findingMatchesOriginal(original, residual)).toBe(true);
  });

  it("matches dependencies by package name", () => {
    const original: PostFixVerifyTarget = {
      category: "VULNERABLE_DEPENDENCY",
      filePath: "package.json",
      line: 12,
      snippet: '"next": "13.0.0"',
      message: "next is an outdated release",
    };
    const residual: SecurityFinding = {
      filePath: "package.json",
      severity: "HIGH",
      rule: "Dependency",
      category: "VULNERABLE_DEPENDENCY",
      line: 12,
      message: "next is an outdated release",
      snippet: '"next": "13.0.0"',
      remediation: { diff: "", command: "" },
    };
    expect(findingMatchesOriginal(original, residual)).toBe(true);
  });
});

describe("captureOriginalSecurityFinding", () => {
  it("captures Provix identity for a secret at the pinned content", () => {
    const content = `export const key = "${stripe}";\n`;
    const target = captureOriginalSecurityFinding(
      { filePath: "src/lib/pay.ts", content },
      "SECRET_LEAK",
      1,
      { snippet: stripe }
    );
    expect(target.category).toBe("SECRET_LEAK");
    expect(target.filePath).toBe("src/lib/pay.ts");
    expect(target.line).toBe(1);
    expect(target.message).toMatch(/Stripe live secret key/i);
    expect(target.rule).toBe("Hardcoded Secret");
  });
});
