"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { generateMaskedAliasFromUuid, getCodenameInitials } from "@/lib/alias-generator";
import { getPublicCandidateLocation } from "@/lib/candidate-anonymization";
import { scoreTalentMatch } from "@/lib/match-heuristic";
import { isVerifiedOnProvix } from "@/lib/published-candidate-profile";
import { clampScore0to100 } from "@/lib/score-scale";
import { PUBLIC_PLACEMENT_TERMS_SUMMARY } from "@/lib/placement-terms";
import { formatGpa } from "@/lib/gpa";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  educationFromProfileRow,
} from "@/lib/talent-pool-profiles";
import {
  fetchProfilesForCandidateIds,
  resolvedProfileId,
} from "@/lib/resolve-candidate-profile";
import CandidateEducationSummary from "@/components/CandidateEducationSummary";
import ScoreMeter from "@/components/ScoreMeter";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import { createClient } from "@/utils/supabase/client";

type ApplicantProfileRow = {
  id: string;
  user_id?: string | null;
  codename_alias?: string | null;
  full_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  contact_email?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  skills?: string[] | null;
  timezone?: string | null;
  country?: string | null;
  job_title?: string | null;
  headline?: string | null;
  bio?: string | null;
  experience_level?: string | null;
  major?: string | null;
  degree?: string | null;
  school?: string | null;
  university?: string | null;
  gpa?: string | number | null;
  graduation_year?: number | string | null;
  education?: unknown;
  is_self_taught?: boolean | string | number | null;
  portfolio_url?: string | null;
  youtube_url?: string | null;
  availability_status?: string | null;
  availability?: string | null;
  work_preference?: string | null;
  role?: string | null;
  integrity_score?: number | string | null;
  audit_data?: unknown;
};

type JobApplicationRow = {
  id: string;
  candidate_id: string;
  created_at: string;
  unlocked?: boolean | null;
  profiles: ApplicantProfileRow | ApplicantProfileRow[] | null;
};

export type JobApplicantView = {
  applicationId: string;
  profileId: string;
  candidateId: string;
  codenameAlias: string;
  initials: string;
  location: string;
  headline: string;
  skills: string[];
  university: string;
  major: string;
  gpa: string;
  graduationYear: string;
  isSelfTaught?: boolean;
  aiScoreLabel: string;
  appliedAtLabel: string;
  unlocked: boolean;
  verifiedOnProvix: boolean;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
};

type JobApplicantsDrawerProps = {
  open: boolean;
  jobId: string | null;
  jobTitle: string;
  employerId: string | null;
  onClose: () => void;
  onRequestIntro: (applicant: JobApplicantView) => void;
};

function formatAiScoreLabel(
  matchPercentage: number | null | undefined,
  candidate: { skills: string[]; headline: string; bio?: string | null },
  jobTitle: string
): string {
  const isCanned =
    matchPercentage === 50 ||
    matchPercentage === 65 ||
    matchPercentage === 94;

  if (
    typeof matchPercentage === "number" &&
    Number.isFinite(matchPercentage) &&
    !isCanned
  ) {
    return `${clampScore0to100(matchPercentage)}% Match`;
  }

  const scored = scoreTalentMatch(
    {
      title: candidate.headline,
      skills: candidate.skills,
      bio: candidate.bio ?? "",
    },
    { title: jobTitle }
  );
  return `${clampScore0to100(scored.match_percentage)}% Match`;
}

function formatAppliedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function resolveProfileRow(
  profiles: ApplicantProfileRow | ApplicantProfileRow[] | null
): ApplicantProfileRow | null {
  if (!profiles) {
    return null;
  }
  return Array.isArray(profiles) ? profiles[0] ?? null : profiles;
}

function resolveContactEmail(profile: ApplicantProfileRow | null): string | null {
  const contactEmail = profile?.contact_email?.trim();
  if (contactEmail) {
    return contactEmail;
  }

  const email = profile?.email?.trim();
  return email || null;
}

const APPLICANT_PROFILE_COLUMNS = [
  "id",
  "user_id",
  "codename_alias",
  "full_name",
  "name",
  "first_name",
  "last_name",
  "contact_email",
  "email",
  "phone",
  "linkedin_url",
  "skills",
  "timezone",
  "country",
  "job_title",
  "headline",
  "bio",
  "experience_level",
  "major",
  "degree",
  "school",
  "university",
  "gpa",
  "graduation_year",
  "education",
  "is_self_taught",
  "portfolio_url",
  "youtube_url",
  "availability_status",
  "availability",
  "work_preference",
  "role",
  "integrity_score",
  "audit_data",
] as const;

async function fetchApplicantProfiles(
  supabase: ReturnType<typeof createClient>,
  candidateIds: string[]
): Promise<Map<string, ApplicantProfileRow>> {
  const byId = new Map<string, ApplicantProfileRow>();
  const uniqueIds = [...new Set(candidateIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return byId;
  }

  const resolved = await fetchProfilesForCandidateIds(
    supabase,
    uniqueIds,
    APPLICANT_PROFILE_COLUMNS.join(", ")
  );

  if (resolved.size > 0) {
    for (const id of uniqueIds) {
      const row = resolved.get(id) as ApplicantProfileRow | undefined;
      if (row) {
        byId.set(id, row);
      }
    }
    if (byId.size > 0) {
      return byId;
    }
  }

  const starRows = await fetchProfilesForCandidateIds(supabase, uniqueIds, "*");
  for (const id of uniqueIds) {
    const row = starRows.get(id) as ApplicantProfileRow | undefined;
    if (row) {
      byId.set(id, row);
    }
  }

  return byId;
}

function mapApplicationToApplicant(
  row: JobApplicationRow,
  matchByCandidateId: Map<string, number>,
  jobTitle: string
): JobApplicantView {
  const profile = resolveProfileRow(row.profiles);
  const profileId =
    resolvedProfileId(
      profile as Record<string, unknown> | null,
      row.candidate_id
    ) ?? row.candidate_id;
  const isUnlocked = Boolean(row.unlocked);
  const maskedAlias = generateMaskedAliasFromUuid(profileId);
  const education = educationFromProfileRow(
    profile as Record<string, unknown> | null
  );

  const skills = Array.isArray(profile?.skills) ? profile.skills : [];
  const headline =
    profile?.headline?.trim() ||
    profile?.job_title?.trim() ||
    "Open Role Candidate";

  return {
    applicationId: row.id,
    profileId,
    candidateId: row.candidate_id,
    codenameAlias: maskedAlias,
    initials: getCodenameInitials(maskedAlias),
    location: getPublicCandidateLocation({
      country: profile?.country,
      timezone: profile?.timezone,
    }),
    headline,
    skills,
    university: education.university,
    major: education.major,
    gpa: formatGpa(education.gpa),
    graduationYear: education.graduationYear,
    isSelfTaught: Boolean(education.isSelfTaught),
    aiScoreLabel: formatAiScoreLabel(
      matchByCandidateId.get(row.candidate_id),
      { skills, headline, bio: profile?.bio },
      jobTitle
    ),
    appliedAtLabel: formatAppliedAt(row.created_at),
    unlocked: isUnlocked,
    verifiedOnProvix: isVerifiedOnProvix(profile),
    fullName: null,
    email: isUnlocked ? resolveContactEmail(profile) : null,
    phone: isUnlocked ? profile?.phone?.trim() || null : null,
    linkedinUrl: isUnlocked ? profile?.linkedin_url?.trim() || null : null,
  };
}

export default function JobApplicantsDrawer({
  open,
  jobId,
  jobTitle,
  employerId,
  onClose,
  onRequestIntro,
}: JobApplicantsDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applicants, setApplicants] = useState<JobApplicantView[]>([]);

  useEffect(() => {
    if (!open || !jobId) {
      return;
    }

    if (!employerId) {
      setError("Could not load interested candidates. Please try again.");
      setLoading(false);
      return;
    }

    let active = true;
    const supabase = createClient();

    const loadApplicants = async () => {
      setLoading(true);
      setError(null);

      try {
        const fromApi = await fetch(
          `/api/jobs/${encodeURIComponent(jobId)}/applicants`,
          { cache: "no-store" }
        );

        if (fromApi.ok) {
          const payload = (await readJsonResponse(fromApi)) as {
            applications?: Array<
              Pick<
                JobApplicationRow,
                "id" | "candidate_id" | "created_at" | "unlocked"
              >
            >;
            profiles?: Record<string, ApplicantProfileRow>;
            matches?: Record<string, number>;
          };

          const rows = payload.applications ?? [];
          const matchByCandidateId = new Map(
            Object.entries(payload.matches ?? {}).map(([id, score]) => [
              id,
              score,
            ])
          );

          if (!active) {
            return;
          }

          setApplicants(
            rows.map((row) =>
              mapApplicationToApplicant(
                {
                  ...row,
                  profiles: payload.profiles?.[row.candidate_id] ?? null,
                },
                matchByCandidateId,
                jobTitle
              )
            )
          );
          return;
        }

        const { data: applicationRows, error: applicationsError } =
          await supabase
            .from("job_applications")
            .select("id, candidate_id, created_at, unlocked")
            .eq("job_id", jobId)
            .order("created_at", { ascending: false });

        if (applicationsError) {
          throw applicationsError;
        }

        const rows = (applicationRows ?? []) as Pick<
          JobApplicationRow,
          "id" | "candidate_id" | "created_at" | "unlocked"
        >[];
        const candidateIds = [
          ...new Set(rows.map((row) => row.candidate_id).filter(Boolean)),
        ];
        const profilesById = await fetchApplicantProfiles(supabase, candidateIds);

        const matchByCandidateId = new Map<string, number>();

        if (candidateIds.length > 0) {
          const { data: matchRows, error: matchError } = await supabase
            .from("talent_match_scores")
            .select("candidate_id, match_percentage")
            .eq("employer_id", employerId)
            .eq("job_id", jobId)
            .in("candidate_id", candidateIds);

          if (matchError) {
            console.error("Failed to load applicant match scores:", matchError);
          } else {
            for (const matchRow of matchRows ?? []) {
              if (matchRow.candidate_id) {
                matchByCandidateId.set(
                  matchRow.candidate_id,
                  matchRow.match_percentage
                );
              }
            }
          }
        }

        if (!active) {
          return;
        }

        setApplicants(
          rows.map((row) =>
            mapApplicationToApplicant(
              {
                ...row,
                profiles: profilesById.get(row.candidate_id) ?? null,
              },
              matchByCandidateId,
              jobTitle
            )
          )
        );
      } catch (loadError) {
        console.error("Failed to load job applicants:", loadError);
        if (active) {
          setError("Could not load interested candidates. Please try again.");
          setApplicants([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadApplicants();

    return () => {
      active = false;
    };
  }, [open, jobId, employerId, jobTitle]);

  useEffect(() => {
    if (!open) {
      setApplicants([]);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open || !jobId) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        aria-label="Close applicants drawer"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <aside className="relative h-full w-full max-w-lg bg-panel border-l border-border flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand">
              Interested Candidates
            </p>
            <h2 className="text-xl font-extrabold text-textMain mt-1">{jobTitle}</h2>
            <p className="text-sm text-textMuted mt-1">
              Anonymized proof-of-work profiles — request an intro with no
              upfront fees. {PUBLIC_PLACEMENT_TERMS_SUMMARY}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-textMuted hover:text-textMain transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-textMuted">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
              Loading applicants...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : applicants.length === 0 ? (
            <div className="rounded-xl border border-border bg-background px-4 py-10 text-center">
              <p className="text-sm text-textMuted">
                No candidates have expressed interest in this role yet.
              </p>
            </div>
          ) : (
            applicants.map((applicant) => (
              <div
                key={applicant.applicationId}
                className="card-edge rounded-2xl border border-border bg-background p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center text-xs font-bold text-brand shrink-0">
                      {applicant.initials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-textMain text-sm truncate">
                        {applicant.codenameAlias}
                      </h3>
                      <p className="text-xs text-brand font-medium mt-0.5 truncate">
                        {applicant.headline}
                      </p>
                      <p className="text-[11px] text-textMuted mt-1">
                        {applicant.location}
                      </p>
                      {(applicant.verifiedOnProvix || applicant.unlocked) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <VerifiedOnProvixPill
                            verified={applicant.verifiedOnProvix}
                          />
                          {applicant.unlocked ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              Contact unlocked
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-mono text-[11px] font-bold tabular-nums text-textMuted">
                      {applicant.aiScoreLabel}
                    </span>
                    {/^\d+/.test(applicant.aiScoreLabel) ? (
                      <ScoreMeter
                        score={Number.parseInt(applicant.aiScoreLabel, 10)}
                        className="w-16"
                      />
                    ) : null}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-2">
                    Education
                  </span>
                  <div className="rounded-xl border border-border bg-panel p-3.5 text-xs text-textMain space-y-2">
                    <CandidateEducationSummary
                      isSelfTaught={applicant.isSelfTaught}
                      university={applicant.university}
                      major={applicant.major}
                      gpa={applicant.gpa}
                      graduationYear={applicant.graduationYear}
                    />
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-2">
                    Skills
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {applicant.skills.length > 0 ? (
                      applicant.skills.slice(0, 4).map((skill) => (
                        <span
                          key={skill}
                          className="px-2 py-1 rounded-md text-[10px] font-bold bg-panel/80 text-textMuted border border-border/50"
                        >
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-textMuted">
                        Skills pending profile sync
                      </span>
                    )}
                    {applicant.skills.length > 4 && (
                      <span className="px-2 py-0.5 text-[11px] rounded bg-white/5 text-textMuted border border-border">
                        +{applicant.skills.length - 4} more
                      </span>
                    )}
                  </div>
                </div>

                {applicant.unlocked && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                    <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest block">
                      Contact Information
                    </span>
                    {applicant.email ? (
                      <a
                        href={`mailto:${applicant.email}`}
                        className="block text-xs text-textMain hover:text-textMain break-all"
                      >
                        {applicant.email}
                      </a>
                    ) : (
                      <p className="text-xs text-textMuted">
                        No email on file for this candidate.
                      </p>
                    )}
                    {applicant.phone && (
                      <p className="text-xs text-textMain">{applicant.phone}</p>
                    )}
                    {applicant.linkedinUrl && (
                      <a
                        href={applicant.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-brand hover:text-brand break-all"
                      >
                        LinkedIn profile
                      </a>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] text-textMuted">
                    Interest expressed {applicant.appliedAtLabel}
                  </span>
                  {applicant.unlocked ? (
                    <span className="text-[11px] font-bold text-emerald-300">
                      Unlocked
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRequestIntro(applicant)}
                      className="text-[11px] font-bold px-3.5 py-2 rounded-lg bg-[#F4F4F6] hover:bg-white text-[#0B0B0D] shadow-sm transition-all cursor-pointer"
                    >
                      Request Intro
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
