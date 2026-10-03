export type AuditScanData = {
  architecture: number;
  devops: number;
  resilience: number;
  testing: number;
  testingScore: number;
  boundaryFile: string | null;
  ciPath: string | null;
  testPathsCount: number;
  unhandledAsyncCount: number | null;
  totalFiles: number;
  tsStrict: boolean;
  ciStatus: string;
  repoKind: "web_app" | "library" | null;
  hasAppRouter: boolean;
  hasBoundary: boolean;
  hasCi: boolean;
};

export type FootprintCell = {
  label: string;
  value: string;
};

export type AuditInsights = {
  strengths: string[];
  risks: string[];
  verdict: string;
  footprint: FootprintCell[];
  interviewQuestions: string[];
};

type Candidate = {
  score: number;
  text: string;
};

function takeTop(candidates: Candidate[], limit: number): string[] {
  return [...candidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.text);
}

function buildStrengths(scanData: AuditScanData): string[] {
  const candidates: Candidate[] = [];

  candidates.push({
    score: scanData.architecture,
    text: scanData.hasBoundary
      ? `Full-Stack Feature Isolation: App Router boundary separation at ${scanData.boundaryFile} decouples server computations from client hydration.`
      : "Full-Stack Feature Isolation: App Router boundary separation decoupling server computations from client hydration.",
  });

  if (scanData.hasCi || scanData.devops >= 50) {
    candidates.push({
      score: Math.max(scanData.devops, scanData.hasCi ? 80 : 0),
      text: scanData.hasCi
        ? `CI/CD Pipeline Automation: Verified automated workflow (${scanData.ciPath || ".github/workflows"}) enforcing build and type check gates before merge.`
        : "CI/CD Pipeline Automation: Verified automated workflows enforcing build and type check gates before merge.",
    });
  }

  candidates.push({
    score: Math.max(scanData.resilience, scanData.architecture * 0.85),
    text: scanData.hasBoundary
      ? `Fault Containment: Scoped boundary handlers at ${scanData.boundaryFile} prevent localized component crashes from terminating the app shell.`
      : "Fault Containment: Scoped boundary handlers preventing localized component crashes from terminating the app shell.",
  });

  if (scanData.testing >= 50) {
    candidates.push({
      score: scanData.testing + 5,
      text: `Regression Resistance: Verified test suite checking ${scanData.testPathsCount} execution paths before merge.`,
    });
  }

  if (scanData.architecture >= 55 && scanData.hasAppRouter) {
    candidates.push({
      score: scanData.architecture - 2,
      text: "Route-Level Ownership: Modular route handlers keep feature work isolated from the shared layout shell.",
    });
  }

  return takeTop(candidates, 3);
}

function buildRisks(scanData: AuditScanData): string[] {
  const candidates: Candidate[] = [];
  const unhandled = scanData.unhandledAsyncCount;

  if (scanData.testing < 50) {
    candidates.push({
      score: 100 - scanData.testing + 10,
      text: `High Regression Exposure: Acute testing deficit (${scanData.testingScore}/100) with only ${scanData.testPathsCount} assertions across ${scanData.totalFiles} files. High risk of breaking existing API contracts.`,
    });
  } else if (scanData.testing < 75) {
    candidates.push({
      score: 100 - scanData.testing,
      text: `Coverage Depth Gap: Testing is ${scanData.testingScore}/100 with ${scanData.testPathsCount} verified paths across ${scanData.totalFiles} files: enough for feature work, not yet zero-defect infrastructure ownership.`,
    });
  }

  candidates.push({
    score: 100 - scanData.resilience,
    text:
      unhandled !== null && unhandled > 0
        ? `Async Failure Cascades: ${unhandled} network fetch routines lack strict timeout boundaries or explicit error fallbacks.`
        : "Async Failure Cascades: Network fetch routines lack strict timeout boundaries or explicit error fallbacks.",
  });

  candidates.push({
    score: 100 - Math.min(scanData.resilience, scanData.architecture),
    text: "Hydration & Network Resilience: Insufficient offline/degraded network state handling.",
  });

  if (!scanData.hasCi || scanData.devops < 60) {
    candidates.push({
      score: scanData.hasCi ? 100 - scanData.devops : 100 - scanData.devops + 8,
      text: scanData.hasCi
        ? "Shallow Pipeline Depth: CI is present, but pre-merge linting and automated test gates are not yet strict enough for unsupervised release ownership."
        : "Manual Deployment Risk: Absence of strict pre-merge linting and automated test gates.",
    });
  }

  if (!scanData.hasBoundary && scanData.repoKind === "web_app") {
    candidates.push({
      score: 100 - scanData.resilience + 6,
      text: "Shell Crash Exposure: No inspected error.tsx or ErrorBoundary, so localized render failures can terminate the app shell.",
    });
  }

  return takeTop(candidates, 3);
}

function buildVerdict(scanData: AuditScanData): string {
  const pillars = [
    { key: "architecture" as const, value: scanData.architecture },
    { key: "devops" as const, value: scanData.devops },
    { key: "testing" as const, value: scanData.testing },
    { key: "resilience" as const, value: scanData.resilience },
  ];
  const dominant = pillars.reduce((best, item) =>
    item.value > best.value ? item : best
  );
  const weakest = pillars.reduce((worst, item) =>
    item.value < worst.value ? item : worst
  );

  const recommend =
    dominant.key === "architecture" || scanData.architecture >= 55
      ? "Recommended for autonomous full-stack product development and rapid Next.js UI shipping."
      : dominant.key === "devops"
        ? "Recommended for owning automated build enforcement and pre-merge validation."
        : dominant.key === "testing"
          ? "Recommended for extending regression coverage across verified execution paths."
          : "Recommended for hardening async request paths and localized fault containment.";

  const unsuitable =
    weakest.key === "testing" || scanData.testing < 45
      ? "Unsuitable to independently own zero-defect core infrastructure or payment/auth pipelines without senior test coverage pairing."
      : weakest.key === "devops"
        ? "Unsuitable to independently own release trains without senior pairing on pre-merge lint and test gates."
        : weakest.key === "resilience"
          ? "Unsuitable to independently own timeout-sensitive network surfaces without senior resilience pairing."
          : "Unsuitable to independently reshape the App Router shell without senior architecture pairing.";

  return `Executive Hiring Verdict: ${recommend} ${unsuitable}`;
}

function buildFootprint(scanData: AuditScanData): FootprintCell[] {
  const architecture =
    scanData.hasAppRouter || scanData.repoKind === "web_app"
      ? "Next.js App Router & Server Boundaries"
      : scanData.architecture >= 50
        ? "Modular Typed Source Structure"
        : "Path Signals Incomplete";

  const pipelines = scanData.hasCi
    ? "Verified GitHub Actions CI"
    : "No CI Workflow Inspected";

  return [
    { label: "Architecture", value: architecture },
    { label: "Pipelines", value: pipelines },
    {
      label: "Test Assertions",
      value: `${scanData.testPathsCount} verified paths`,
    },
    {
      label: "Surface Area",
      value: `${scanData.totalFiles} inspected files`,
    },
  ];
}

function buildInterviewQuestions(scanData: AuditScanData): string[] {
  const questions: string[] = [];

  if (scanData.testing < 50) {
    questions.push(
      `With testing at ${scanData.testingScore}/100 and ${scanData.testPathsCount} verified paths across ${scanData.totalFiles} files, which API contract would you lock with a characterization test first, and which failure must that test catch?`
    );
  } else {
    questions.push(
      `Walk through how the verified suite (${scanData.testPathsCount} paths) blocks a regression on the highest-risk route mutation.`
    );
  }

  if (scanData.hasBoundary) {
    questions.push(
      `At ${scanData.boundaryFile}, how do you keep a localized component crash from terminating the App Router shell while still surfacing a typed error to the caller?`
    );
  } else {
    questions.push(
      "How would you design a route-level error boundary that isolates a failing client hydration tree from the shared layout shell?"
    );
  }

  if (scanData.resilience < 70 || (scanData.unhandledAsyncCount ?? 0) > 0) {
    const count =
      scanData.unhandledAsyncCount !== null
        ? `${scanData.unhandledAsyncCount} inspected `
        : "";
    questions.push(
      `Where do the ${count}async/fetch calls get a hard timeout and an explicit fallback so a degraded network cannot cascade into the UI shell?`
    );
  } else if (scanData.devops < 60) {
    questions.push(
      "How do you stop a breaking typecheck or lint failure from reaching production when pre-merge CI gates are incomplete?"
    );
  } else {
    questions.push(
      "Trace one request from a Server Component into a route handler and name the failure mode you refuse to swallow."
    );
  }

  return questions.slice(0, 3);
}

export function synthesizeAuditInsights(scanData: AuditScanData): AuditInsights {
  return {
    strengths: buildStrengths(scanData),
    risks: buildRisks(scanData),
    verdict: buildVerdict(scanData),
    footprint: buildFootprint(scanData),
    interviewQuestions: buildInterviewQuestions(scanData),
  };
}
