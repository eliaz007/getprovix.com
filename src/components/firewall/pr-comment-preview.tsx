"use client";

import { useState, type ReactNode } from "react";

type CheckState = "OK" | "FAILED";

type Check = {
  label: string;
  state: CheckState;
  detail: string;
};

type Report = {
  id: "failed" | "patched";
  status: "FAILED" | "PASSED";
  checks: readonly Check[];
  patch: readonly string[];
};

const REPORTS: readonly Report[] = [
  {
    id: "failed",
    status: "FAILED",
    checks: [
      { label: "AST_PARSE", state: "OK", detail: "tree accepted" },
      { label: "BOUNDARY_CHECK", state: "FAILED", detail: "`app/checkout/page.tsx` secret bound on the client tree" },
      { label: "SECRET_SCAN", state: "FAILED", detail: "`sk_live_…` in `app/checkout/page.tsx`" },
      { label: "IMMUTABLE_CHECK", state: "OK", detail: "server boundary sealed" },
      { label: "DEPENDENCY_FLOOR", state: "OK", detail: "`package.json` held" },
    ],
    patch: [
      "Replace the hardcoded key with `process.env.STRIPE_SECRET_KEY`.",
      "Append `STRIPE_SECRET_KEY=` to `.env.example`.",
      "Move the client query behind `getSecret()` and add `import { createClient } from \"@/utils/supabase/server\"`.",
    ],
  },
  {
    id: "patched",
    status: "PASSED",
    checks: [
      { label: "AST_PARSE", state: "OK", detail: "tree accepted" },
      { label: "BOUNDARY_CHECK", state: "OK", detail: "`await getSecret(\"STRIPE_SECRET_KEY\")`" },
      { label: "SECRET_SCAN", state: "OK", detail: "no hardcoded keys" },
      { label: "IMMUTABLE_CHECK", state: "OK", detail: "`createClient` stays on the server" },
      { label: "DEPENDENCY_FLOOR", state: "OK", detail: "`package.json` held" },
    ],
    patch: [
      "Patch applied on `provix/security-checkout`.",
      "`.env.example` contains `STRIPE_SECRET_KEY=`.",
      "The pull request is clear to merge.",
    ],
  },
];

function toMarkdown(report: Report): string {
  const rows = report.checks
    .map((check) => `| ${check.label} | ${check.state} | ${check.detail} |`)
    .join("\n");
  const patch = report.patch.map((line) => `- ${line}`).join("\n");
  return [
    "## Provix · architecture firewall",
    "",
    `\`STATUS\` **${report.status}**`,
    "",
    "| Check | State | Detail |",
    "| --- | --- | --- |",
    rows,
    "",
    "### Automated patch",
    "",
    patch,
    "",
    "_Posted by the Provix check on this pull request._",
  ].join("\n");
}

function stateClass(state: CheckState | Report["status"]): string {
  return state === "OK" || state === "PASSED" ? "text-[#34d399]" : "text-rose-400";
}

export default function PrCommentPreview(): ReactNode {
  const [reportId, setReportId] = useState<Report["id"]>("failed");
  const [mode, setMode] = useState<"preview" | "markdown">("preview");
  const report = REPORTS.find((item) => item.id === reportId) ?? REPORTS[0];
  const markdown = toMarkdown(report);

  return (
    <section
      aria-labelledby="pr-comment-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-purple-400 uppercase">Pull request</p>
          <h2 id="pr-comment-heading" className="mt-2 text-xl font-semibold tracking-tight text-[#f9fafb]">
            GitHub comment
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5" role="tablist" aria-label="Report state">
            {REPORTS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === report.id}
                onClick={() => setReportId(item.id)}
                className={`rounded-md px-3 py-1.5 font-mono text-[11px] tracking-wide transition-[background-color,color,transform] active:scale-[0.98] ${
                  item.id === report.id ? "bg-purple-600 text-white" : "text-[#f9fafb]/55 hover:text-[#f9fafb]"
                }`}
              >
                {item.id === "failed" ? "Failing rules" : "After patch"}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5" role="tablist" aria-label="Comment format">
            {(["preview", "markdown"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                onClick={() => setMode(item)}
                className={`rounded-md px-3 py-1.5 font-mono text-[11px] tracking-wide transition-[background-color,color,transform] active:scale-[0.98] ${
                  mode === item ? "bg-white/[0.08] text-[#f9fafb]" : "text-[#f9fafb]/55 hover:text-[#f9fafb]"
                }`}
              >
                {item === "preview" ? "Preview" : "Markdown"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <article className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-black/80 backdrop-blur-sm">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-[11px] font-semibold text-white">
            P
          </span>
          <div>
            <p className="text-sm font-medium text-[#f9fafb]">
              provix[bot] <span className="font-normal text-[#f9fafb]/45">commented on this pull request</span>
            </p>
            <p className="font-mono text-[10px] tracking-wide text-purple-300">check · architecture firewall</p>
          </div>
        </header>
        {mode === "markdown" ? (
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-[#f9fafb]/80">
            {markdown}
          </pre>
        ) : (
          <div className="px-4 py-4 sm:px-5">
            <h3 className="text-base font-semibold text-[#f9fafb]">Provix · architecture firewall</h3>
            <p className="mt-3 font-mono text-[13px]">
              <span className="text-[#f9fafb]/50">STATUS</span>{" "}
              <span className={`font-semibold ${stateClass(report.status)}`}>{report.status}</span>
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left font-mono text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[#f9fafb]/40">
                    <th className="py-2 pr-4 font-medium">Check</th>
                    <th className="py-2 pr-4 font-medium">State</th>
                    <th className="py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {report.checks.map((check) => (
                    <tr key={check.label} className="border-b border-white/[0.06]">
                      <td className="py-2 pr-4 text-[#f9fafb]/85">{check.label}</td>
                      <td className={`py-2 pr-4 ${stateClass(check.state)}`}>{check.state}</td>
                      <td className="py-2 text-[#f9fafb]/55">{check.detail.replaceAll("`", "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h4 className="mt-5 text-sm font-semibold text-[#f9fafb]">Automated patch</h4>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[#f9fafb]/75">
              {report.patch.map((line) => (
                <li key={line}>{line.replaceAll("`", "")}</li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </section>
  );
}
