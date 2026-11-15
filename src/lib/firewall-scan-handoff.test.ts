import { describe, expect, it } from "vitest";
import { SCAN_COVERAGE_COPY } from "@/lib/firewall-repo-access";
import { isStaleScanSummaryNote, normalizeScanSummaryNote } from "@/lib/firewall-scan-handoff";

describe("normalizeScanSummaryNote", () => {
  it("rewrites Architecture firewall / 50 largest jargon", () => {
    const stale =
      "Scanned acme/app. Architecture firewall and security board reviewed the 50 largest source files and 40 config files.";
    expect(isStaleScanSummaryNote(stale)).toBe(true);
    expect(normalizeScanSummaryNote(stale, "acme/app")).toBe(
      `Scanned acme/app. ${SCAN_COVERAGE_COPY}`
    );
  });

  it("rewrites security guard + scanned N of M copy", () => {
    const stale =
      "Scanned acme/app. Architecture firewall and security guard reviewed the 50 largest source files. Scanned 50 of 200 source files (largest first).";
    expect(normalizeScanSummaryNote(stale, "https://github.com/acme/app")).toContain(SCAN_COVERAGE_COPY);
    expect(normalizeScanSummaryNote(stale, "acme/app")).not.toMatch(/Architecture firewall|largest source/i);
  });

  it("keeps already-clean notes", () => {
    const clean = `Scanned acme/app. ${SCAN_COVERAGE_COPY}`;
    expect(normalizeScanSummaryNote(clean, "acme/app")).toBe(clean);
  });
});
