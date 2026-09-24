import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null } }),
      refreshSession: async () => ({ data: { session: null } }),
    },
  }),
}));

import {
  employerVisibleProductionAudit,
  isVerifiedDossier,
  parseProductionAuditFromProfileRow,
} from "./production-audit";

const breakdown = {
  architecture_score: 80,
  ci_cd_score: 80,
  test_density: 80,
  error_handling: 80,
  audited_repo_url: "https://github.com/calcom/cal.com",
  audited_at: "2026-09-22T00:00:00.000Z",
};

describe("dossier ownership verification", () => {
  it("does not treat a saved unowned repo as verified", () => {
    const record = parseProductionAuditFromProfileRow({
      production_score: 88,
      audit_breakdown: breakdown,
      is_audit_verified: true,
      is_publicly_visible: true,
      verification_status: "unverified",
    });

    expect(record?.verificationStatus).toBe("unverified");
    expect(record?.isAuditVerified).toBe(false);
    expect(isVerifiedDossier(record)).toBe(false);
    expect(employerVisibleProductionAudit(record)).toBeNull();
  });

  it("treats missing verification_status as unverified even if is_audit_verified is true", () => {
    const record = parseProductionAuditFromProfileRow({
      production_score: 90,
      audit_breakdown: breakdown,
      is_audit_verified: true,
      is_publicly_visible: true,
    });

    expect(record?.verificationStatus).toBe("unverified");
    expect(isVerifiedDossier(record)).toBe(false);
    expect(employerVisibleProductionAudit(record)).toBeNull();
  });

  it("exposes a verified dossier to employers only when status is verified", () => {
    const record = parseProductionAuditFromProfileRow({
      production_score: 88,
      audit_breakdown: {
        ...breakdown,
        audited_repo_url: "https://github.com/acme/widgets",
      },
      is_audit_verified: true,
      is_publicly_visible: true,
      verification_status: "verified",
    });

    expect(isVerifiedDossier(record)).toBe(true);
    expect(employerVisibleProductionAudit(record)?.productionScore).toBe(88);
  });
});
