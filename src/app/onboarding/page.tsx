"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  DEFAULT_PUBLIC_COUNTRY,
  generateCodenameAlias,
} from "@/lib/alias-generator";
import {
  EMPLOYER_DASHBOARD_PATH,
  normalizeAccountKind,
  persistEmployerAccount,
} from "@/lib/account-role";
import {
  buildAuditorSetupPath,
  CANDIDATE_ONBOARDING_DRAFT_KEY,
  getFeaturedRepoValidationMessage,
  hasCompletedCandidateSetup,
  hasFeaturedGitHubRepository,
  parseSkillsInput,
  type CandidateOnboardingDraft,
} from "@/lib/candidate-onboarding";
import { handleGitHubLinkIdentity } from "@/lib/github-auth";
import {
  githubUsernameFromUser,
  syncGitHubIdentityToProfile,
  userHasGitHubIdentity,
} from "@/lib/github-identity";
import { createClient } from "@/utils/supabase/client";
import {
  DEFAULT_EXPERIENCE_LEVEL,
  EXPERIENCE_LEVEL_OPTIONS,
  type ExperienceLevel,
} from "@/lib/experience-level";
import {
  DEFAULT_CANDIDATE_TIMEZONE,
  DEFAULT_WORK_PREFERENCE,
} from "@/lib/work-preference";
import { PUBLIC_SCORECARD_THRESHOLD } from "@/lib/production-audit";
import {
  normalizeGitHubAuditTarget,
  parseGitHubRepoPath,
} from "@/lib/validate-github-url";
import { GitHubLogo } from "@/components/GitHubSignInButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ProvixLogo } from "@/components/ProvixLogo";

type AccountRole = "candidate" | "business";

/** Same columns as middleware — avoid github_* until migration 0079 is guaranteed. */
const ONBOARDING_PROFILE_SELECT =
  "role, full_name, name, first_name, last_name, job_title, headline, bio, skills, experience_level, portfolio_url";

const INDUSTRIES = [
  "Software Engineering and Tech",
  "AI and Machine Learning",
  "Fintech and Web3",
  "Infrastructure and DevOps",
  "Product and Design",
];

const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"];

const inputClass =
  "bg-background border border-border text-textMain rounded-lg px-4 py-3 placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all";

function OnboardingSkeleton() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card interactive={false} className="p-8 max-w-md w-full">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="h-8 w-8 rounded-full border-2 border-border border-t-indigo-500 animate-spin" />
          <p className="text-sm text-textMuted">Loading your onboarding...</p>
        </div>
        <div className="space-y-3">
          <div className="h-6 w-48 mx-auto rounded bg-panel animate-pulse" />
          <div className="h-4 w-64 mx-auto rounded bg-panel animate-pulse" />
          <div className="h-12 rounded-lg bg-panel animate-pulse" />
          <div className="h-12 rounded-lg bg-panel animate-pulse" />
          <div className="h-12 rounded-lg bg-panel animate-pulse" />
        </div>
      </Card>
    </div>
  );
}

function readOnboardingDraft(): CandidateOnboardingDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(CANDIDATE_ONBOARDING_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CandidateOnboardingDraft;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeOnboardingDraft(draft: CandidateOnboardingDraft) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(
    CANDIDATE_ONBOARDING_DRAFT_KEY,
    JSON.stringify(draft)
  );
}

function clearOnboardingDraft() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(CANDIDATE_ONBOARDING_DRAFT_KEY);
}

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [accountRole, setAccountRole] = useState<AccountRole | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [githubVerified, setGithubVerified] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [bio, setBio] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    DEFAULT_EXPERIENCE_LEVEL
  );
  const [githubUrl, setGithubUrl] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [companySize, setCompanySize] = useState(COMPANY_SIZES[0]);
  const [hiringPreferences, setHiringPreferences] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkingGithub, setLinkingGithub] = useState(false);

  const parsedRepo = useMemo(
    () => parseGitHubRepoPath(githubUrl),
    [githubUrl]
  );

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    (async () => {
      try {
        const { data, error: getUserError } = await supabase.auth.getUser();
        if (!isMounted) return;

        if (getUserError || !data.user) {
          router.push("/login?next=%2Fonboarding");
          return;
        }

        setUser(data.user);

        const urlError = new URLSearchParams(window.location.search)
          .get("error")
          ?.trim();
        if (urlError === "oauth_failed" || urlError === "auth_failed") {
          setError(
            "GitHub connection failed. Please try Connect GitHub Account again."
          );
          const cleaned = new URL(window.location.href);
          cleaned.searchParams.delete("error");
          window.history.replaceState(
            {},
            "",
            `${cleaned.pathname}${cleaned.search}`
          );
        }

        const linkedIdentity = userHasGitHubIdentity(data.user);
        const identityUsername = githubUsernameFromUser(data.user);

        // Best-effort; must not block the form if github_* columns are missing.
        if (linkedIdentity) {
          await syncGitHubIdentityToProfile(supabase, data.user);
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select(ONBOARDING_PROFILE_SELECT)
          .eq("id", data.user.id)
          .maybeSingle();

        if (!isMounted) return;

        if (profileError) {
          console.error(
            "[onboarding] profiles select failed:",
            profileError.message,
            profileError.code
          );
          setError(
            "Could not load your profile. You can still complete setup below."
          );
        }

        const kind = normalizeAccountKind(
          typeof profile?.role === "string" ? profile.role : null
        );
        if (!kind) {
          router.replace("/onboarding/role");
          return;
        }

        if (kind === "candidate" && hasCompletedCandidateSetup(profile)) {
          // Returning from Connect GitHub restores a draft; otherwise skip completed setup.
          const draft = readOnboardingDraft();
          if (!draft) {
            router.replace("/dashboard/profile");
            return;
          }
        }

        setGithubVerified(linkedIdentity);
        setGithubUsername(identityUsername);

        const draft = readOnboardingDraft();
        if (draft) {
          if (draft.fullName) setFullName(draft.fullName);
          if (draft.jobTitle) setJobTitle(draft.jobTitle);
          if (draft.bio) setBio(draft.bio);
          if (draft.skillsInput) setSkillsInput(draft.skillsInput);
          if (
            draft.experienceLevel &&
            EXPERIENCE_LEVEL_OPTIONS.includes(
              draft.experienceLevel as ExperienceLevel
            )
          ) {
            setExperienceLevel(draft.experienceLevel as ExperienceLevel);
          }
          if (draft.githubUrl) setGithubUrl(draft.githubUrl);
        } else if (kind === "candidate" && profile) {
          const name =
            profile.full_name?.trim() ||
            profile.name?.trim() ||
            [profile.first_name?.trim() || "", profile.last_name?.trim() || ""]
              .filter(Boolean)
              .join(" ");
          if (name) setFullName(name);
          if (profile.job_title?.trim() || profile.headline?.trim()) {
            setJobTitle(
              profile.job_title?.trim() || profile.headline?.trim() || ""
            );
          }
          if (profile.bio?.trim()) setBio(profile.bio.trim());
          if (Array.isArray(profile.skills) && profile.skills.length > 0) {
            setSkillsInput(
              profile.skills
                .filter((skill): skill is string => typeof skill === "string")
                .join(", ")
            );
          }
          if (
            typeof profile.experience_level === "string" &&
            EXPERIENCE_LEVEL_OPTIONS.includes(
              profile.experience_level as ExperienceLevel
            )
          ) {
            setExperienceLevel(profile.experience_level as ExperienceLevel);
          }
          if (profile.portfolio_url?.trim()) {
            setGithubUrl(profile.portfolio_url.trim());
          }
        }

        setAccountRole(kind === "employer" ? "business" : "candidate");
      } catch (loadError) {
        console.error("[onboarding] mount load failed:", loadError);
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load onboarding."
          );
          // Allow the form to render even when profile fetch fails.
          setAccountRole((current) => current ?? "candidate");
        }
      } finally {
        if (isMounted) {
          setCheckingRole(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const saveCandidateProfile = async (repoUrl: string) => {
    if (!user) {
      throw new Error("Sign in to continue.");
    }

    const skills = parseSkillsInput(skillsInput);
    if (skills.length === 0) {
      throw new Error("Add at least one primary skill.");
    }
    if (!bio.trim()) {
      throw new Error("Add a short bio.");
    }

    const supabase = createClient();
    const codenameAlias = generateCodenameAlias({
      profileId: user.id,
      jobTitle,
      headline: jobTitle,
    });
    const { error: saveError } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: fullName.trim(),
      job_title: jobTitle.trim(),
      headline: jobTitle.trim(),
      bio: bio.trim(),
      skills,
      experience_level: experienceLevel,
      role: "candidate",
      is_visible_in_pool: false,
      portfolio_url: repoUrl,
      codename_alias: codenameAlias,
      country: DEFAULT_PUBLIC_COUNTRY,
      work_preference: DEFAULT_WORK_PREFERENCE,
      timezone: DEFAULT_CANDIDATE_TIMEZONE,
      availability_status: "Available Now",
      availability: "Available Now",
    });

    if (saveError) {
      throw new Error(saveError.message);
    }
  };

  const handleCandidateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    setError(null);

    const repoError = getFeaturedRepoValidationMessage(githubUrl);
    if (repoError) {
      setError(repoError);
      return;
    }

    const repoUrl = normalizeGitHubAuditTarget(githubUrl);
    if (!repoUrl) {
      setError(getFeaturedRepoValidationMessage(githubUrl));
      return;
    }

    setSaving(true);

    try {
      await saveCandidateProfile(repoUrl);
      clearOnboardingDraft();
      window.location.assign(buildAuditorSetupPath(repoUrl));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not save your setup."
      );
      setSaving(false);
    }
  };

  const handleConnectGitHub = async () => {
    setError(null);
    setLinkingGithub(true);
    writeOnboardingDraft({
      fullName,
      jobTitle,
      bio,
      skillsInput,
      experienceLevel,
      githubUrl,
    });

    try {
      const { error: linkError } = await handleGitHubLinkIdentity("/onboarding");
      if (linkError) {
        setError(linkError.message);
        setLinkingGithub(false);
      }
      // On success, Supabase redirects away.
    } catch (linkErr) {
      setError(
        linkErr instanceof Error
          ? linkErr.message
          : "Could not start GitHub linking."
      );
      setLinkingGithub(false);
    }
  };

  const handleBusinessSubmit = async () => {
    if (!user) {
      return;
    }

    setError(null);
    setSaving(true);

    const supabase = createClient();
    await persistEmployerAccount(supabase, user.id, user.email);
    const { error: saveError } = await supabase
      .from("profiles")
      .update({
        company_name: companyName,
        industry,
        company_size: companySize,
        hiring_preferences: hiringPreferences,
        role: "employer",
        is_visible_in_pool: false,
      })
      .eq("id", user.id);

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    window.location.href = EMPLOYER_DASHBOARD_PATH;
  };

  if (checkingRole) {
    return <OnboardingSkeleton />;
  }

  if (!accountRole) {
    return <OnboardingSkeleton />;
  }

  const isEmployer = accountRole === "business";
  const submitLabel = saving ? "Saving..." : "Save & Continue to Dashboard";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card interactive={false} className="p-8 max-w-md w-full">
        <div className="mb-6 flex justify-center">
          <ProvixLogo />
        </div>
        <h1 className="text-2xl font-extrabold text-textMain tracking-tight text-center">
          {isEmployer ? "Set up your company" : "Complete your developer setup"}
        </h1>
        <p className="text-sm text-textMuted text-center mb-8">
          {isEmployer
            ? "Tell us about your team so we can match you with the Provix Talent Network."
            : "Fill in the essentials, then continue to the auditor to verify your featured repo."}
        </p>

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">
            {error}
          </div>
        )}

        {isEmployer ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="companyName" className="text-sm font-medium text-textMuted">
                Company Name
              </label>
              <input
                id="companyName"
                type="text"
                name="companyName"
                placeholder="Your company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="industry" className="text-sm font-medium text-textMuted">
                Industry
              </label>
              <select
                id="industry"
                name="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className={inputClass}
              >
                {INDUSTRIES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="companySize" className="text-sm font-medium text-textMuted">
                Company Size
              </label>
              <select
                id="companySize"
                name="companySize"
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                className={inputClass}
              >
                {COMPANY_SIZES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="hiringPreferences" className="text-sm font-medium text-textMuted">
                Hiring Preferences
              </label>
              <textarea
                id="hiringPreferences"
                name="hiringPreferences"
                rows={4}
                placeholder="Roles you hire for, tech stack, intern vs full-time, etc."
                value={hiringPreferences}
                onChange={(e) => setHiringPreferences(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>

            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                void handleBusinessSubmit();
              }}
              disabled={saving}
              className="w-full mt-4"
            >
              {saving ? "Saving..." : "Continue to Dashboard"}
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleCandidateSubmit}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fullName" className="text-sm font-medium text-textMuted">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                name="fullName"
                placeholder="Jordan Lee"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="jobTitle" className="text-sm font-medium text-textMuted">
                Job Title / Headline
              </label>
              <input
                id="jobTitle"
                type="text"
                name="jobTitle"
                placeholder="Full-Stack Engineer"
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="bio" className="text-sm font-medium text-textMuted">
                Bio
              </label>
              <textarea
                id="bio"
                name="bio"
                rows={4}
                placeholder="What you build, how you work, and what you're looking for next."
                required
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="skills" className="text-sm font-medium text-textMuted">
                Primary Skills
              </label>
              <input
                id="skills"
                type="text"
                name="skills"
                placeholder="TypeScript, Next.js, PostgreSQL"
                required
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                className={inputClass}
              />
              <p className="text-[11px] text-textMuted">
                Comma-separated. These power employer matching.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="experienceLevel" className="text-sm font-medium text-textMuted">
                Experience Level
              </label>
              <select
                id="experienceLevel"
                name="experienceLevel"
                required
                value={experienceLevel}
                onChange={(e) =>
                  setExperienceLevel(e.target.value as ExperienceLevel)
                }
                className={inputClass}
              >
                {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="githubUrl" className="text-sm font-medium text-textMuted">
                Featured GitHub Repository
              </label>
              <input
                id="githubUrl"
                type="url"
                name="githubUrl"
                placeholder="https://github.com/username/repo-name"
                required
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className={inputClass}
              />
              <p className="text-[11px] text-textMuted">
                Provix audits this public repository to calculate your score. A
                score of {PUBLIC_SCORECARD_THRESHOLD}+ is required for talent
                network visibility.
              </p>
              {parsedRepo ? (
                <p className="text-[11px] font-mono text-cyan-300/90">
                  Parsed: {parsedRepo.owner}/{parsedRepo.repo}
                </p>
              ) : githubUrl.trim() ? (
                <p className="text-[11px] text-amber-300/90">
                  Enter a full owner/repo URL to continue.
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-panel/60 px-4 py-3">
              {githubVerified ? (
                <div className="flex items-start gap-2.5 text-sm text-emerald-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold text-emerald-200">
                      GitHub account connected
                    </p>
                    <p className="mt-0.5 text-[12px] text-emerald-300/80">
                      {githubUsername
                        ? `@${githubUsername} is linked. After saving, submit your featured repo in the auditor.`
                        : "Your GitHub identity is linked. After saving, submit your featured repo in the auditor."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-textMuted">
                    Connect GitHub to skip the later{" "}
                    <span className="font-mono text-textMain">provix.txt</span>{" "}
                    ownership check. Or continue now and verify in the auditor.
                  </p>
                  <button
                    type="button"
                    disabled={linkingGithub || saving}
                    onClick={() => void handleConnectGitHub()}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-textMain transition-colors hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
                  >
                    {linkingGithub ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <GitHubLogo className="h-4 w-4" />
                    )}
                    {linkingGithub
                      ? "Connecting GitHub…"
                      : "Connect GitHub Account"}
                  </button>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={
                saving ||
                linkingGithub ||
                !hasFeaturedGitHubRepository(githubUrl)
              }
              className="w-full mt-2"
            >
              {saving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              {submitLabel}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
