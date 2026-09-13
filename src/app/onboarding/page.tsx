"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  buildCodenameAliasInputFromProfile,
  DEFAULT_PUBLIC_COUNTRY,
  generateCodenameAlias,
} from "@/lib/alias-generator";
import {
  EMPLOYER_DASHBOARD_PATH,
  normalizeAccountKind,
  persistEmployerAccount,
  resolveAccountRole as resolveSignupAccountRole,
} from "@/lib/account-role";
import { createClient } from "@/utils/supabase/client";
import {
  DEFAULT_EXPERIENCE_LEVEL,
  EXPERIENCE_LEVEL_OPTIONS,
  type ExperienceLevel,
} from "@/lib/experience-level";
import {
  DEFAULT_CANDIDATE_TIMEZONE,
  DEFAULT_WORK_PREFERENCE,
  TIMEZONE_OPTIONS,
  WORK_PREFERENCE_OPTIONS,
  type CandidateTimezone,
  type WorkPreference,
} from "@/lib/work-preference";
import {
  getGitHubUrlValidationMessage,
  isValidGitHubUrl,
  normalizeGitHubUrl,
} from "@/lib/validate-github-url";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

type AccountRole = "candidate" | "business";

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

function resolveAccountRole(
  profileRole: string | null | undefined,
  metaRole: unknown
): AccountRole {
  const resolved = resolveSignupAccountRole(profileRole, metaRole);
  return normalizeAccountKind(resolved) === "employer" ? "business" : "candidate";
}

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

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [accountRole, setAccountRole] = useState<AccountRole | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);

  const [fullName, setFullName] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    DEFAULT_EXPERIENCE_LEVEL
  );
  const [workPreference, setWorkPreference] = useState<WorkPreference>(
    DEFAULT_WORK_PREFERENCE
  );
  const [candidateTimezone, setCandidateTimezone] = useState<CandidateTimezone>(
    DEFAULT_CANDIDATE_TIMEZONE
  );
  const [githubUrl, setGithubUrl] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [companySize, setCompanySize] = useState(COMPANY_SIZES[0]);
  const [hiringPreferences, setHiringPreferences] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    (async () => {
      const { data, error: getUserError } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (getUserError || !data.user) {
        router.push("/login");
        return;
      }

      setUser(data.user);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!isMounted) return;

      setAccountRole(
        resolveAccountRole(profile?.role, data.user.user_metadata?.role)
      );
      setCheckingRole(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleCandidateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    setError(null);

    const githubValidationMessage = getGitHubUrlValidationMessage(githubUrl);
    if (githubValidationMessage) {
      setError(githubValidationMessage);
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const codenameAlias = generateCodenameAlias({
      profileId: user.id,
      jobTitle,
      headline: jobTitle,
    });
    const { error: saveError } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: fullName,
      graduation_year: graduationYear ? Number(graduationYear) : null,
      job_title: jobTitle,
      experience_level: experienceLevel,
      role: "candidate",
      is_visible_in_pool: false,
      portfolio_url: normalizeGitHubUrl(githubUrl),
      codename_alias: codenameAlias,
      country: DEFAULT_PUBLIC_COUNTRY,
      work_preference: workPreference,
      timezone: candidateTimezone,
    });

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    router.push("/dashboard");
  };

  const handleBusinessSubmit = async () => {
    console.log("HANDLER TRIGGERED!");
    if (!user) {
      console.error("No authenticated user found!");
      return;
    }

    setError(null);
    setSaving(true);

    const supabase = createClient();
    await persistEmployerAccount(supabase, user.id, user.email);
    const { error } = await supabase
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

    if (error) {
      console.error("SUPABASE ERROR DETAILS:", error);
      setError(error.message);
      setSaving(false);
      return;
    }

    window.location.href = EMPLOYER_DASHBOARD_PATH;
  };

  if (checkingRole || !accountRole) {
    return <OnboardingSkeleton />;
  }

  const isEmployer = accountRole === "business";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card interactive={false} className="p-8 max-w-md w-full">
        <h1 className="text-2xl font-extrabold text-textMain tracking-tight text-center">
          {isEmployer ? "Set up your company" : "Complete Your Profile"}
        </h1>
        <p className="text-sm text-textMuted text-center mb-8">
          {isEmployer
            ? "Tell us about your team so we can match you with the Provix Talent Network."
            : "A few quick details before you get to the dashboard."}
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
                handleBusinessSubmit();
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
              <label htmlFor="graduationYear" className="text-sm font-medium text-textMuted">
                Graduation Year
              </label>
              <input
                id="graduationYear"
                type="number"
                name="graduationYear"
                placeholder="2027"
                required
                min={1950}
                max={2100}
                value={graduationYear}
                onChange={(e) => setGraduationYear(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="jobTitle" className="text-sm font-medium text-textMuted">
                Role
              </label>
              <input
                id="jobTitle"
                type="text"
                name="jobTitle"
                placeholder="Software Engineer, Student, etc."
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className={inputClass}
              />
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="workPreference"
                  className="text-sm font-medium text-textMuted"
                >
                  Work Preference
                </label>
                <select
                  id="workPreference"
                  name="workPreference"
                  required
                  value={workPreference}
                  onChange={(e) =>
                    setWorkPreference(e.target.value as WorkPreference)
                  }
                  className={inputClass}
                >
                  {WORK_PREFERENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="candidateTimezone"
                  className="text-sm font-medium text-textMuted"
                >
                  Timezone
                </label>
                <select
                  id="candidateTimezone"
                  name="candidateTimezone"
                  required
                  value={candidateTimezone}
                  onChange={(e) =>
                    setCandidateTimezone(e.target.value as CandidateTimezone)
                  }
                  className={inputClass}
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="githubUrl" className="text-sm font-medium text-textMuted">
                GitHub Profile URL <span className="text-rose-400">*</span>
              </label>
              <input
                id="githubUrl"
                type="url"
                name="githubUrl"
                placeholder="https://github.com/your-handle"
                required
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className={inputClass}
              />
              <p className="text-[11px] text-textMuted">
                Required. Must include github.com (e.g. https://github.com/your-handle).
              </p>
            </div>

            <Button
              type="submit"
              disabled={saving || !isValidGitHubUrl(githubUrl)}
              className="w-full mt-4"
            >
              {saving ? "Saving..." : "Continue to Dashboard"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
