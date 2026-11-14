import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { FirewallPvimFinding, FirewallReport } from "@/lib/firewall-contract";
import { buildRunnerChecks, runnerStatus } from "@/lib/firewall-runner";
import {
  buildPvimAnalysisView,
  buildPvimFindingViews,
  buildPvimFixWithPrRequestBody,
  buildPvimReasoningView,
  buildPvimSecurityStatusStrip,
  canOfferPvimFixWithPr,
  describePvimRemediation,
  shouldRenderPvimPanel,
  summarizePvimText,
} from "@/lib/pvim/pvim-findings-view";
import PvimFindingsPanel from "@/components/firewall/pvim-findings-panel";
import { PvimStatusIndicator } from "@/components/firewall/security-guard-panel";
import { FirewallViewProvider } from "@/components/firewall/firewall-view-context";

const PIN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function baseReport(overrides: Partial<FirewallReport> = {}): FirewallReport {
  return {
    timestamp: "2026-11-07T00:00:00.000Z",
    architectureScore: 88,
    summary: {
      totalFiles: 2,
      totalLines: 40,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
    violations: [
      {
        filePath: "src/a.ts",
        severity: "LOW",
        rule: "orphan",
        message: "Provix architecture note",
        line: 1,
        category: "ARCHITECTURE",
      },
    ],
    largestFiles: [],
    commitSha: PIN,
    ...overrides,
  };
}

function finding(overrides: Partial<FirewallPvimFinding> = {}): FirewallPvimFinding {
  return {
    findingId: "m2:authz:1",
    source: "pvim",
    engineSource: "m2",
    label: "authorization_flaw",
    ruleId: "m2_p1_request_controlled_owner",
    confidence: "confirmed",
    family: "p1",
    filePath: "src/app/api/items/route.ts",
    line: 20,
    message: "Request-controlled owner filter",
    remediation: {
      kind: "unsupported",
      code: "unsupported_label",
      reason: "Authorization findings are not autofixable in Provix today.",
    },
    ...overrides,
  };
}

function supportedSecret(overrides: Partial<FirewallPvimFinding> = {}): FirewallPvimFinding {
  return finding({
    findingId: "m1:secret:src/lib/pay.ts:3",
    engineSource: "m1",
    label: "secret_hardcoded",
    ruleId: "m1_secret_literal",
    confidence: "confirmed",
    family: null,
    filePath: "src/lib/pay.ts",
    line: 3,
    message: "Hardcoded API key",
    remediation: {
      kind: "supported",
      category: "SECRET_LEAK",
      requiresScannerAgreement: true,
    },
    ...overrides,
  });
}

function renderPanel(report: FirewallReport): string {
  return renderToStaticMarkup(
    createElement(FirewallViewProvider, null, createElement(PvimFindingsPanel, { report }))
  );
}

describe("pvim findings view model", () => {
  it("hides the panel for older reports without PVIM data", () => {
    const report = baseReport();
    expect(shouldRenderPvimPanel(report)).toBe(false);
    expect(buildPvimAnalysisView(undefined, undefined).visible).toBe(false);
    expect(renderPanel(report)).toBe("");
  });

  it("hides absent analysis", () => {
    const report = baseReport({
      pvim: {
        status: "absent",
        findingCount: 0,
        incomplete: 0,
        elapsedMs: 0,
      },
    });
    expect(shouldRenderPvimPanel(report)).toBe(false);
    expect(renderPanel(report)).toBe("");
  });

  it("renders unavailable, timeout, and error states without claiming a clean scan", () => {
    for (const status of ["unavailable", "timeout", "error"] as const) {
      const html = renderPanel(
        baseReport({
          pvim: {
            status,
            findingCount: 0,
            incomplete: 0,
            elapsedMs: 2500,
            engineVersion: "0.1.0",
            message: `${status} detail`,
          },
        })
      );
      expect(html).toContain("PVIM shadow analysis");
      expect(html).toContain("0.1.0");
      expect(html).toContain(`${status} detail`);
      expect(html).not.toContain("clean PVIM scan");
      if (status === "unavailable") {
        expect(html).toContain("Unavailable");
        expect(html).not.toContain("PVIM findings");
      }
      if (status === "timeout") expect(html).toContain("Timed out");
      if (status === "error") expect(html).toContain("Error");
    }
  });

  it("renders incomplete analysis honestly", () => {
    const html = renderPanel(
      baseReport({
        pvim: {
          status: "incomplete",
          findingCount: 1,
          incomplete: 3,
          elapsedMs: 800,
          engineVersion: "0.1.0",
          message: "Excluded 3 local file(s) before PVIM send.",
        },
        pvimFindings: [finding()],
      })
    );
    expect(html).toContain("Incomplete");
    expect(html).toContain("Do not treat this as a clean PVIM scan");
    expect(html).toContain("Excluded 3 local file(s)");
    expect(html).toContain("Authorization flaw");
  });

  it("renders zero-findings completed state", () => {
    const html = renderPanel(
      baseReport({
        pvim: {
          status: "ok",
          findingCount: 0,
          incomplete: 0,
          elapsedMs: 40,
          engineVersion: "0.1.0",
        },
        pvimFindings: [],
      })
    );
    expect(html).toContain("Clear");
    expect(html).toContain("No PVIM findings for this commit.");
    expect(html).toContain("0");
  });

  it("renders multiple findings separately from Provix security copy", () => {
    const html = renderPanel(
      baseReport({
        pvim: {
          status: "ok",
          findingCount: 2,
          incomplete: 0,
          elapsedMs: 1200,
          engineVersion: "0.1.0",
          jobId: "job-1",
        },
        pvimFindings: [
          finding(),
          finding({
            findingId: "m1:secret:2",
            label: "secret_hardcoded",
            ruleId: "m1_secret_literal",
            confidence: "potential",
            family: null,
            filePath: "src/config.ts",
            line: 4,
            message: "Hardcoded API key",
            remediation: { kind: "pending" },
          }),
        ],
      })
    );
    expect(html).toContain("PVIM findings");
    expect(html).toContain("Authorization flaw");
    expect(html).toContain("Hardcoded secret");
    expect(html).toContain("m2_p1_request_controlled_owner");
    expect(html).toContain("m1_secret_literal");
    expect(html).toContain("src/app/api/items/route.ts:20");
    expect(html).toContain("src/config.ts:4");
    expect(html).toContain("Not autofixable");
    expect(html).toContain("Pending review");
    expect(html).toContain("Separate analysis engine");
    expect(html).not.toContain("Fixable leak and dependency exposures");
  });

  it("handles missing optional fields without inventing values", () => {
    const views = buildPvimFindingViews([
      finding({
        family: null,
        filePath: null,
        line: null,
        message: undefined,
        snippet: undefined,
        remediation: undefined,
        confidence: "confirmed",
      }),
    ]);
    expect(views[0]?.family).toBeNull();
    expect(views[0]?.filePath).toBeNull();
    expect(views[0]?.line).toBeNull();
    expect(views[0]?.message).toBeNull();
    expect(views[0]?.snippet).toBeNull();
    expect(views[0]?.remediation.claimsFixable).toBe(false);

    const html = renderPanel(
      baseReport({
        pvim: {
          status: "ok",
          findingCount: 1,
          incomplete: 0,
          elapsedMs: 10,
        },
        pvimFindings: [
          finding({
            family: null,
            filePath: null,
            line: null,
            message: undefined,
            remediation: undefined,
          }),
        ],
      })
    );
    expect(html).toContain("No file location");
    expect(html).toContain("Manual review");
    expect(html).not.toContain("family ");
  });

  it("never claims fixable unless remediation metadata is supported", () => {
    expect(describePvimRemediation(undefined).claimsFixable).toBe(false);
    expect(describePvimRemediation({ kind: "pending" }).claimsFixable).toBe(false);
    expect(
      describePvimRemediation({
        kind: "unsupported",
        code: "unsupported_label",
        reason: "nope",
      }).claimsFixable
    ).toBe(false);
    expect(
      describePvimRemediation({
        kind: "supported",
        category: "SECRET_LEAK",
        requiresScannerAgreement: true,
      }).claimsFixable
    ).toBe(true);

    const html = renderPanel(
      baseReport({
        pvim: { status: "ok", findingCount: 1, incomplete: 0, elapsedMs: 1 },
        pvimFindings: [
          finding({
            remediation: {
              kind: "supported",
              category: "SECRET_LEAK",
              requiresScannerAgreement: true,
            },
          }),
        ],
      })
    );
    expect(html).toContain("Supported (review required)");
    expect(html).toContain("Fix with PR");
    expect(html).not.toContain("no auto-remediation here");
    expect(html).not.toContain("Fix with PR only appears");
  });

  it("offers Fix with PR only for supported findings with a pinned commit SHA", () => {
    const supported = supportedSecret();
    expect(canOfferPvimFixWithPr(supported, { commitSha: PIN })).toBe(true);
    expect(canOfferPvimFixWithPr(supported, { commitSha: undefined })).toBe(false);
    expect(canOfferPvimFixWithPr(supported, { commitSha: "   " })).toBe(false);
    expect(
      canOfferPvimFixWithPr(
        supportedSecret({
          remediation: {
            kind: "unsupported",
            code: "unsupported_label",
            reason: "nope",
          },
        }),
        { commitSha: PIN }
      )
    ).toBe(false);
    expect(
      canOfferPvimFixWithPr(supportedSecret({ remediation: { kind: "pending" } }), {
        commitSha: PIN,
      })
    ).toBe(false);
    expect(
      canOfferPvimFixWithPr(supportedSecret({ confidence: "potential" }), { commitSha: PIN })
    ).toBe(false);
    expect(
      canOfferPvimFixWithPr(supportedSecret({ filePath: null, line: null }), { commitSha: PIN })
    ).toBe(false);

    const unsupportedHtml = renderPanel(
      baseReport({
        pvim: { status: "ok", findingCount: 1, incomplete: 0, elapsedMs: 1 },
        pvimFindings: [finding()],
      })
    );
    expect(unsupportedHtml).toContain("Not offered as Fix with PR");
    expect(unsupportedHtml).not.toMatch(/>\s*Fix with PR\s*</);

    const missingShaHtml = renderPanel(
      baseReport({
        commitSha: undefined,
        pvim: { status: "ok", findingCount: 1, incomplete: 0, elapsedMs: 1 },
        pvimFindings: [supported],
      })
    );
    expect(missingShaHtml).toContain("Not offered as Fix with PR");
    expect(missingShaHtml).not.toMatch(/>\s*Fix with PR\s*</);

    const supportedHtml = renderPanel(
      baseReport({
        pvim: { status: "ok", findingCount: 1, incomplete: 0, elapsedMs: 1 },
        pvimFindings: [supported],
      })
    );
    expect(supportedHtml).toContain("Fix with PR");
    expect(supportedHtml).not.toContain("Not offered as Fix with PR");
  });

  it("builds the dashboard Fix-with-PR request from the validated finding and pinned SHA", () => {
    const body = buildPvimFixWithPrRequestBody(supportedSecret({ snippet: "sk_live_example" }), {
      repoSlug: "acme/app",
      commitSha: PIN,
    });
    expect(body).toEqual({
      kind: "security",
      repoUrl: "acme/app",
      filePath: "src/lib/pay.ts",
      commitSha: PIN,
      snippet: "sk_live_example",
      pvimFinding: {
        finding_id: "m1:secret:src/lib/pay.ts:3",
        source: "m1",
        family: null,
        label: "secret_hardcoded",
        rule_id: "m1_secret_literal",
        confidence: "confirmed",
        path: "src/lib/pay.ts",
        start_line: 3,
        message: "Hardcoded API key",
      },
    });

    expect(
      buildPvimFixWithPrRequestBody(finding(), { repoSlug: "acme/app", commitSha: PIN })
    ).toBeNull();
    expect(
      buildPvimFixWithPrRequestBody(supportedSecret(), { repoSlug: "acme/app", commitSha: "" })
    ).toBeNull();
    expect(
      buildPvimFixWithPrRequestBody(supportedSecret({ filePath: null }), {
        repoSlug: "acme/app",
        commitSha: PIN,
      })
    ).toBeNull();
  });

  it("escapes repository-derived text safely", () => {
    const nasty = '<img src=x onerror="alert(1)">&"\'';
    const html = renderPanel(
      baseReport({
        pvim: {
          status: "error",
          findingCount: 1,
          incomplete: 0,
          elapsedMs: 1,
          message: nasty,
        },
        pvimFindings: [
          finding({
            message: nasty,
            ruleId: nasty,
            label: "authorization_flaw",
            snippet: `<script>alert("xss")</script>`,
            remediation: {
              kind: "unsupported",
              code: "unsupported_label",
              reason: nasty,
            },
          }),
        ],
      })
    );
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not change Provix scoring or runner status", () => {
    const clean = baseReport();
    const withPvim = baseReport({
      pvim: {
        status: "ok",
        findingCount: 2,
        incomplete: 0,
        elapsedMs: 50,
        engineVersion: "0.1.0",
      },
      pvimFindings: [finding(), finding({ findingId: "m2:2" })],
    });
    expect(withPvim.architectureScore).toBe(clean.architectureScore);
    expect(runnerStatus(buildRunnerChecks(withPvim))).toBe(runnerStatus(buildRunnerChecks(clean)));
    expect(withPvim.violations.every((v) => v.source !== "pvim")).toBe(true);
  });

  it("summarizes text without inventing content", () => {
    expect(summarizePvimText(undefined)).toBeNull();
    expect(summarizePvimText("  ")).toBeNull();
    expect(summarizePvimText("one   two")).toBe("one two");
  });

  it("buildPvimAnalysisView marks incomplete even with findings", () => {
    const view = buildPvimAnalysisView(
      {
        status: "incomplete",
        findingCount: 2,
        incomplete: 4,
        elapsedMs: 900,
      },
      [finding()]
    );
    expect(view.statusLabel).toBe("Incomplete");
    expect(view.statusTone).toBe("warn");
    expect(view.headline).toMatch(/incomplete coverage/i);
  });

  it("buildPvimReasoningView hides when reasoning is absent", () => {
    expect(buildPvimReasoningView(undefined).visible).toBe(false);
    expect(buildPvimReasoningView(null).visible).toBe(false);
  });

  it("buildPvimReasoningView supports skipped/unavailable/invalid without advisory body", () => {
    for (const status of ["skipped", "unavailable", "invalid"] as const) {
      const view = buildPvimReasoningView({
        status,
        detail: `${status} detail`,
        hasCriticalReliabilityFlags: false,
        criticalReliabilityFlags: [],
        notes: "should not show",
        openQuestions: ["hidden?"],
      });
      expect(view.visible).toBe(true);
      expect(view.status).toBe(status);
      expect(view.showsAdvisoryBody).toBe(false);
      expect(view.notes).toBeNull();
      expect(view.openQuestions).toEqual([]);
      expect(view.disclaimer).toMatch(/does not authorize fixes/i);
    }
  });

  it("buildPvimReasoningView shows present advisory body and human-review warning", () => {
    const view = buildPvimReasoningView({
      status: "present",
      detail: "validated_advisory",
      hasCriticalReliabilityFlags: true,
      criticalReliabilityFlags: ["ownership_inversion"],
      notes: "Review carefully.",
      openQuestions: ["Was ownership checked?"],
      answerBlurbs: ["gap_auth: No op-level authz."],
    });
    expect(view.visible).toBe(true);
    expect(view.showsAdvisoryBody).toBe(true);
    expect(view.needsHumanReview).toBe(true);
    expect(view.criticalFlags).toContain("ownership_inversion");
    expect(view.notes).toMatch(/Review/);
    expect(view.openQuestions).toHaveLength(1);
    expect(view.answerBlurbs).toHaveLength(1);
  });

  it("panel omits advisory subsection when reasoning is absent and renders it when present", () => {
    const without = renderPanel(
      baseReport({
        pvim: { status: "ok", findingCount: 0, incomplete: 0, elapsedMs: 1 },
        pvimFindings: [],
      })
    );
    expect(without).toContain("PVIM shadow analysis");
    expect(without).not.toContain("Advisory reasoning (non-authoritative)");

    const withReasoning = renderPanel(
      baseReport({
        pvim: { status: "ok", findingCount: 0, incomplete: 0, elapsedMs: 1 },
        pvimFindings: [],
        pvimReasoning: {
          status: "present",
          detail: "validated_advisory",
          hasCriticalReliabilityFlags: true,
          criticalReliabilityFlags: ["ownership_inversion"],
          notes: "Advisory note text",
        },
      })
    );
    expect(withReasoning).toContain("Advisory reasoning (non-authoritative)");
    expect(withReasoning).toContain("does not authorize fixes");
    expect(withReasoning).toContain("Human review recommended");
    expect(withReasoning).toContain("Advisory note text");
  });

  describe("buildPvimSecurityStatusStrip", () => {
    it("hides when PVIM was not attached (fail-open / older reports)", () => {
      expect(buildPvimSecurityStatusStrip(baseReport()).visible).toBe(false);
      expect(
        buildPvimSecurityStatusStrip(
          baseReport({ pvim: { status: "absent", findingCount: 0, incomplete: 0, elapsedMs: 0 } })
        ).visible
      ).toBe(false);
    });

    it("shows unavailable without inventing advisory when reasoning is missing", () => {
      const strip = buildPvimSecurityStatusStrip(
        baseReport({
          pvim: {
            status: "unavailable",
            findingCount: 0,
            incomplete: 0,
            elapsedMs: 12,
            message: "unreachable",
          },
        })
      );
      expect(strip.visible).toBe(true);
      expect(strip.analysisLabel).toBe("Unavailable");
      expect(strip.advisory).toBeNull();
      expect(strip.summary).toBe("PVIM Unavailable");
      expect(strip.disclaimer).not.toMatch(/confirmed/i);
    });

    it("marks incomplete analysis honestly", () => {
      const strip = buildPvimSecurityStatusStrip(
        baseReport({
          pvim: { status: "incomplete", findingCount: 1, incomplete: 4, elapsedMs: 40 },
          pvimFindings: [finding()],
        })
      );
      expect(strip.analysisLabel).toBe("Incomplete");
      expect(strip.analysisTone).toBe("warn");
      expect(strip.summary).toBe("PVIM Incomplete");
    });

    it("reports advisory available only when reasoning status is present", () => {
      const strip = buildPvimSecurityStatusStrip(
        baseReport({
          pvim: { status: "ok", findingCount: 0, incomplete: 0, elapsedMs: 10 },
          pvimReasoning: {
            status: "present",
            detail: "validated_advisory",
            hasCriticalReliabilityFlags: false,
            criticalReliabilityFlags: [],
            notes: "Optional notes",
          },
        })
      );
      expect(strip.advisory).toEqual({
        available: true,
        label: "Advisory available",
        tone: "info",
      });
      expect(strip.summary).toBe("PVIM Complete · Advisory available");
      expect(strip.disclaimer).toMatch(/does not authorize fixes/i);
      expect(strip.summary).not.toMatch(/confirmed/i);
    });

    it("reports no advisory for skipped/unavailable/invalid reasoning", () => {
      for (const status of ["skipped", "unavailable", "invalid"] as const) {
        const strip = buildPvimSecurityStatusStrip(
          baseReport({
            pvim: { status: "ok", findingCount: 0, incomplete: 0, elapsedMs: 10 },
            pvimReasoning: {
              status,
              detail: `${status}`,
              hasCriticalReliabilityFlags: false,
              criticalReliabilityFlags: [],
            },
          })
        );
        expect(strip.advisory).toEqual({
          available: false,
          label: "No advisory",
          tone: "neutral",
        });
        expect(strip.summary).toBe("PVIM Complete · No advisory");
      }
    });

    it("PvimStatusIndicator renders analysis and advisory pills without listing findings", () => {
      const strip = buildPvimSecurityStatusStrip(
        baseReport({
          pvim: { status: "incomplete", findingCount: 2, incomplete: 3, elapsedMs: 20 },
          pvimFindings: [finding()],
          pvimReasoning: {
            status: "present",
            detail: "validated_advisory",
            hasCriticalReliabilityFlags: true,
            criticalReliabilityFlags: ["ownership_inversion"],
          },
        })
      );
      const html = renderToStaticMarkup(createElement(PvimStatusIndicator, { strip }));
      expect(html).toContain("pvim-security-status");
      expect(html).toContain("Incomplete");
      expect(html).toContain("Advisory available");
      expect(html).toContain("does not authorize fixes");
      expect(html).not.toContain("authorization_flaw");
      expect(html).not.toContain(finding().filePath!);
    });

    it("PvimStatusIndicator renders nothing when strip is hidden", () => {
      const html = renderToStaticMarkup(
        createElement(PvimStatusIndicator, { strip: buildPvimSecurityStatusStrip(baseReport()) })
      );
      expect(html).toBe("");
    });
  });
});
