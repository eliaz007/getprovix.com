import { describe, expect, it } from "vitest";
import {
  hasCompleteRequiredProfileFields,
  isPublishedVerifiedCandidateProfile,
  isVerifiedOnProvix,
} from "@/lib/published-candidate-profile";

function completeVerifiedRow(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    role: "candidate",
    full_name: "Ada Lovelace",
    job_title: "Full-Stack Engineer",
    bio: "Builds proof-backed products.",
    skills: ["TypeScript", "Next.js"],
    experience_level: "Mid-Level (3-5 years)",
    availability_status: "Available Now",
    work_preference: "Remote",
    timezone: "America/Denver",
    portfolio_url: "https://github.com/ada/engine",
    github_verified: true,
    github_username: "ada",
    production_score: 88,
    integrity_score: 88,
    is_visible_in_pool: true,
    audit_data: {
      integrity_score: 88,
      github_audit: {
        repo_url: "https://github.com/ada/engine",
        owner: "ada",
        repo: "engine",
        commit_count_sampled: 12,
        commit_dates: ["2026-01-01"],
        readme_excerpt: "# Engine",
      },
    },
    ...overrides,
  };
}

describe("required profile fields", () => {
  it("treats a featured owner/repo URL as the required GitHub field", () => {
    expect(
      hasCompleteRequiredProfileFields(completeVerifiedRow())
    ).toBe(true);
    expect(
      hasCompleteRequiredProfileFields(
        completeVerifiedRow({
          portfolio_url: "https://github.com/ada",
        })
      )
    ).toBe(false);
  });
});

describe("Verified on Provix badge gate", () => {
  it("requires github_verified and a 75+ production score", () => {
    expect(isVerifiedOnProvix(completeVerifiedRow())).toBe(true);
    expect(
      isVerifiedOnProvix(
        completeVerifiedRow({
          github_verified: false,
          production_score: 90,
        })
      )
    ).toBe(false);
    expect(
      isVerifiedOnProvix(
        completeVerifiedRow({
          github_verified: true,
          production_score: 63,
          audit_score: 63,
          integrity_score: 90,
        })
      )
    ).toBe(false);
    expect(
      isVerifiedOnProvix(
        completeVerifiedRow({
          github_verified: true,
          production_score: null,
          audit_score: 76,
          integrity_score: null,
          audit_data: null,
        })
      )
    ).toBe(true);
  });
});

describe("published verified talent-pool eligibility", () => {
  it("includes published, complete, proof-backed candidates", () => {
    expect(
      isPublishedVerifiedCandidateProfile(completeVerifiedRow())
    ).toBe(true);
  });

  it("excludes bare/incomplete signup profiles even when marked visible", () => {
    expect(
      isPublishedVerifiedCandidateProfile(
        completeVerifiedRow({
          full_name: "",
          job_title: "",
          bio: "",
          skills: [],
          experience_level: "",
          availability_status: "",
          work_preference: "",
          timezone: "",
          portfolio_url: "",
          integrity_score: null,
          audit_data: null,
          production_score: null,
          github_verified: false,
          is_visible_in_pool: true,
        })
      )
    ).toBe(false);
  });

  it("excludes unpublished profiles even when verified on Provix", () => {
    expect(
      isPublishedVerifiedCandidateProfile(
        completeVerifiedRow({
          is_visible_in_pool: false,
          visible_to_employers: false,
        })
      )
    ).toBe(false);
  });

  it("treats a 75+ production score as verified proof-of-work only with GitHub linked", () => {
    expect(
      isPublishedVerifiedCandidateProfile(
        completeVerifiedRow({
          integrity_score: null,
          audit_data: null,
          production_score: 81,
          github_verified: true,
        })
      )
    ).toBe(true);
    expect(
      isPublishedVerifiedCandidateProfile(
        completeVerifiedRow({
          integrity_score: null,
          audit_data: null,
          production_score: 81,
          github_verified: false,
        })
      )
    ).toBe(false);
    expect(
      isPublishedVerifiedCandidateProfile(
        completeVerifiedRow({
          integrity_score: null,
          audit_data: null,
          production_score: 74,
          github_verified: true,
        })
      )
    ).toBe(false);
  });

  it("excludes employer and employee roles from the talent pool", () => {
    expect(
      isPublishedVerifiedCandidateProfile(
        completeVerifiedRow({ role: "employer" })
      )
    ).toBe(false);
    expect(
      isPublishedVerifiedCandidateProfile(
        completeVerifiedRow({ role: "employee" })
      )
    ).toBe(false);
  });
});
