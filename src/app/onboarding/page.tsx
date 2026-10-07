"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { CheckCircle2, Copy, Loader2, X } from "lucide-react";
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
  CANDIDATE_ONBOARDING_DRAFT_KEY,
  getFeaturedRepoValidationMessage,
  hasCompletedCandidateSetup,
  hasFeaturedGitHubRepository,
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
  buildProvixVerificationToken,
  canonicalGitHubRepoUrl,
  PROVIX_FILENAME,
} from "@/lib/provix-token";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import { getStandardEmailValidationMessage } from "@/lib/validate-email";
import {
  limitCandidateSkills,
  MAX_CORE_SKILLS,
} from "@/lib/candidate-skills";
import {
  normalizeGitHubAuditTarget,
  parseGitHubRepoPath,
} from "@/lib/validate-github-url";
import { GitHubLogo } from "@/components/GitHubSignInButton";
import SkillPicker from "@/components/dashboard/skill-picker";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ProvixLogo } from "@/components/ProvixLogo";

type AccountRole = "candidate" | "business";
type CandidateFlowStep = 1 | 2 | 3;

const AUDIT_TELEMETRY_STAGES = [
  "Cloning repository snapshot",
  "Parsing AST & dependency graph",
  "Auditing tests & CI/CD signals",
  "Scoring architecture & error handling",
] as const;

const DASHBOARD_HOME = "/dashboard";

function inferSkillsFromAuditPaths(paths: string[]): string[] {
  const blob = paths.join("\n").toLowerCase();
  const detected: string[] = [];
  const add = (skill: string) => {
    if (detected.length >= MAX_CORE_SKILLS) return;
    if (detected.some((item) => item.toLowerCase() === skill.toLowerCase())) {
      return;
    }
    detected.push(skill);
  };

  if (/\.tsx?\b|tsconfig|typescript/.test(blob)) add("TypeScript");
  if (/next\.config|\/app\/.*page\.|\/pages\//.test(blob)) add("Next.js");
  if (/react|\.jsx\b/.test(blob)) add("React");
  if (/package\.json|node\.js|express|nestjs/.test(blob)) add("Node.js");
  if (/\.py\b|pyproject|requirements\.txt|pytest/.test(blob)) add("Python");
  if (/\.go\b|go\.mod/.test(blob)) add("Go");
  if (/\.rs\b|cargo\.toml/.test(blob)) add("Rust");
  if (/\.java\b|pom\.xml|build\.gradle/.test(blob)) add("Java");
  if (/dockerfile|docker-compose/.test(blob)) add("Docker");
  if (/postgres|prisma|\.sql\b/.test(blob)) add("PostgreSQL");
  if (/graphql/.test(blob)) add("GraphQL");
  if (/kubernetes|k8s|\.yaml/.test(blob) && /deploy|helm|kustomize/.test(blob)) {
    add("Kubernetes");
  }

  return limitCandidateSkills(detected);
}

const ONBOARDING_PROFILE_SELECT =
  "role, full_name, name, first_name, last_name, job_title, headline, portfolio_url, contact_email, email";

const INDUSTRIES = [
  "Software Engineering and Tech",
  "AI and Machine Learning",
  "Fintech and Web3",
  "Infrastructure and DevOps",
  "Product and Design",
];

const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"];

const inputClass =
  "bg-background border border-border text-textMain rounded-lg px-4 py-3 placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all disabled:cursor-not-allowed disabled:opacity-50";

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
  const [tokenVerified, setTokenVerified] = useState(false);

  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("Software Engineer");
  const [githubUrl, setGithubUrl] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    DEFAULT_EXPERIENCE_LEVEL
  );
  const [primarySkills, setPrimarySkills] = useState<string[]>([]);
  const [joiningNetwork, setJoiningNetwork] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [companySize, setCompanySize] = useState(COMPANY_SIZES[0]);
  const [hiringPreferences, setHiringPreferences] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkingGithub, setLinkingGithub] = useState(false);
  const [flowStep, setFlowStep] = useState<CandidateFlowStep>(1);
  const [initializingAudit, setInitializingAudit] = useState(false);
  const [auditingRepoUrl, setAuditingRepoUrl] = useState("");
  const [telemetryStage, setTelemetryStage] = useState(0);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditScore, setAuditScore] = useState<number | null>(null);

  const [tokenPanelOpen, setTokenPanelOpen] = useState(false);
  const [tokenRepoUrl, setTokenRepoUrl] = useState("");
  const [tokenEmail, setTokenEmail] = useState("");
  const [tokenConfirming, setTokenConfirming] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const identityUnlocked = githubVerified || tokenVerified;
  const verificationToken = user ? buildProvixVerificationToken(user.id) : "";
  const activeStep: CandidateFlowStep =
    flowStep === 3 ? 3 : identityUnlocked ? 2 : 1;

  const parsedRepo = useMemo(
    () => parseGitHubRepoPath(githubUrl),
    [githubUrl]
  );
  const parsedTokenRepo = useMemo(
    () => parseGitHubRepoPath(tokenRepoUrl),
    [tokenRepoUrl]
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
        setTokenEmail(data.user.email?.trim() || "");

        const urlError = new URLSearchParams(window.location.search)
          .get("error")
          ?.trim();
        if (urlError === "oauth_failed" || urlError === "auth_failed") {
          setError(
            "GitHub connection failed. Please try Connect with GitHub again."
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
            "Could not load your profile. You can still complete verification below."
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
          const draft = readOnboardingDraft();
          if (!draft) {
            router.replace("/dashboard/auditor");
            return;
          }
        }

        setGithubVerified(linkedIdentity);
        setGithubUsername(identityUsername);

        const draft = readOnboardingDraft();
        if (draft) {
          if (draft.fullName) setFullName(draft.fullName);
          if (draft.jobTitle) setJobTitle(draft.jobTitle);
          if (draft.githubUrl) {
            setGithubUrl(draft.githubUrl);
            setTokenRepoUrl(draft.githubUrl);
          }
          if (draft.contactEmail) setTokenEmail(draft.contactEmail);
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
              profile.job_title?.trim() ||
                profile.headline?.trim() ||
                "Software Engineer"
            );
          }
          if (profile.portfolio_url?.trim()) {
            setGithubUrl(profile.portfolio_url.trim());
            setTokenRepoUrl(profile.portfolio_url.trim());
          }
          const contact =
            (typeof profile.contact_email === "string" &&
              profile.contact_email.trim()) ||
            (typeof profile.email === "string" && profile.email.trim()) ||
            data.user.email?.trim() ||
            "";
          if (contact) setTokenEmail(contact);
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

  const saveCandidateProfile = async (repoUrl: string, contactEmail?: string) => {
    if (!user) {
      throw new Error("Sign in to continue.");
    }

    const supabase = createClient();
    const resolvedName =
      fullName.trim() ||
      githubUsername ||
      user.email?.split("@")[0] ||
      "Developer";
    const resolvedTitle = jobTitle.trim() || "Software Engineer";
    const codenameAlias = generateCodenameAlias({
      profileId: user.id,
      jobTitle: resolvedTitle,
      headline: resolvedTitle,
    });

    const payload: Record<string, unknown> = {
      id: user.id,
      full_name: resolvedName,
      job_title: resolvedTitle,
      headline: resolvedTitle,
      role: "candidate",
      is_visible_in_pool: false,
      portfolio_url: repoUrl,
      codename_alias: codenameAlias,
      country: DEFAULT_PUBLIC_COUNTRY,
      work_preference: DEFAULT_WORK_PREFERENCE,
      timezone: DEFAULT_CANDIDATE_TIMEZONE,
      availability_status: "Available Now",
      availability: "Available Now",
    };

    const email = contactEmail?.trim();
    if (email) {
      payload.contact_email = email;
    }

    const { error: saveError } = await supabase.from("profiles").upsert(payload);

    if (saveError) {
      throw new Error(saveError.message);
    }
  };

  const finishWithRepo = async (repoUrl: string, contactEmail?: string) => {
    await saveCandidateProfile(repoUrl, contactEmail);
    clearOnboardingDraft();
  };

  const dispatchBackgroundAudit = (repoUrl: string) => {
    void (async () => {
      try {
        const response = await fetchWithAuth("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            githubUrl: repoUrl,
            targetRole: jobTitle.trim() || "Software Engineer",
            workIsPrivate: false,
            externalProjects: [],
          }),
        });

        const data = await readJsonResponse<{
          score?: number;
          error?: string;
          message?: string;
          filesystem?: {
            sample_paths?: string[];
            architecture_paths?: string[];
            test_paths?: string[];
            ci_workflow_paths?: string[];
          } | null;
        }>(response);

        if (!response.ok) {
          throw new Error(
            data.error || data.message || "Audit request failed. Try again shortly."
          );
        }

        const nextScore =
          typeof data.score === "number" && Number.isFinite(data.score)
            ? Math.round(data.score)
            : null;
        setAuditScore(nextScore);

        const inferred = inferSkillsFromAuditPaths([
          ...(data.filesystem?.sample_paths ?? []),
          ...(data.filesystem?.architecture_paths ?? []),
          ...(data.filesystem?.test_paths ?? []),
          ...(data.filesystem?.ci_workflow_paths ?? []),
        ]);
        if (inferred.length > 0) {
          setPrimarySkills(inferred);
        }

        if (user && nextScore != null) {
          await createClient()
            .from("profiles")
            .update({
              production_score: nextScore,
              audit_score: nextScore,
            })
            .eq("id", user.id);
        }
      } catch (auditErr) {
        setAuditError(
          auditErr instanceof Error
            ? auditErr.message
            : "Could not complete the repository audit."
        );
      }
    })();
  };

  const handleRunAudit = async () => {
    if (!identityUnlocked || initializingAudit) {
      return;
    }

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

    setError(null);
    setAuditError(null);
    setAuditScore(null);
    setTelemetryStage(0);
    setInitializingAudit(true);

    try {
      await finishWithRepo(repoUrl);
      setAuditingRepoUrl(repoUrl);
      dispatchBackgroundAudit(repoUrl);
      setFlowStep(3);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not start the audit."
      );
    } finally {
      setInitializingAudit(false);
    }
  };

  const handleReEvaluateLatestCommit = () => {
    const repoUrl =
      auditingRepoUrl ||
      normalizeGitHubAuditTarget(githubUrl) ||
      "";
    if (!repoUrl || initializingAudit) {
      return;
    }

    setAuditError(null);
    setAuditScore(null);
    setTelemetryStage(0);
    setAuditingRepoUrl(repoUrl);
    dispatchBackgroundAudit(repoUrl);
  };

  const goToDashboard = () => {
    window.location.assign(DASHBOARD_HOME);
  };

  const resetToRepositoryStep = () => {
    setFlowStep(2);
    setAuditError(null);
    setAuditScore(null);
    setTelemetryStage(0);
    setInitializingAudit(false);
  };

  const finalizePlacement = async (joinNetwork: boolean) => {
    if (!user || auditScore == null || joiningNetwork) {
      return;
    }

    if (joinNetwork && primarySkills.length === 0) {
      setError("Add at least one primary skill to enter the talent network.");
      return;
    }

    setJoiningNetwork(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: saveError } = await supabase
        .from("profiles")
        .update({
          experience_level: experienceLevel,
          skills: limitCandidateSkills(primarySkills),
          production_score: auditScore,
          audit_score: auditScore,
          is_visible_in_pool: joinNetwork,
          visible_to_employers: joinNetwork,
          is_publicly_visible: joinNetwork,
        })
        .eq("id", user.id);

      if (saveError) {
        throw new Error(saveError.message);
      }

      goToDashboard();
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error
          ? finalizeError.message
          : "Could not update your placement status."
      );
      setJoiningNetwork(false);
    }
  };

  useEffect(() => {
    if (activeStep !== 3 || auditScore != null || auditError) {
      return;
    }

    const timer = window.setInterval(() => {
      setTelemetryStage((current) => (current + 1) % AUDIT_TELEMETRY_STAGES.length);
    }, 2400);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeStep, auditScore, auditError]);

  const handleConnectGitHub = async () => {
    setError(null);
    setLinkingGithub(true);
    writeOnboardingDraft({
      fullName,
      jobTitle,
      githubUrl,
      contactEmail: tokenEmail,
    });

    try {
      const { error: linkError } = await handleGitHubLinkIdentity("/onboarding");
      if (linkError) {
        setError(linkError.message);
        setLinkingGithub(false);
      }
    } catch (linkErr) {
      setError(
        linkErr instanceof Error
          ? linkErr.message
          : "Could not start GitHub linking."
      );
      setLinkingGithub(false);
    }
  };

  const openTokenPanel = () => {
    setTokenError(null);
    setTokenPanelOpen(true);
    if (!tokenRepoUrl && githubUrl) {
      setTokenRepoUrl(githubUrl);
    }
  };

  const copyVerificationToken = async () => {
    if (!verificationToken) return;
    try {
      await navigator.clipboard.writeText(verificationToken);
      setTokenCopied(true);
      window.setTimeout(() => setTokenCopied(false), 1800);
    } catch {
      setTokenError("Could not copy the token. Select it and copy manually.");
    }
  };

  const confirmTokenAndUnlock = async () => {
    if (!user) {
      setTokenError("Sign in to verify repository ownership.");
      return;
    }

    const emailMessage = getStandardEmailValidationMessage(tokenEmail);
    if (emailMessage) {
      setTokenError(emailMessage);
      return;
    }

    const repoError = getFeaturedRepoValidationMessage(tokenRepoUrl);
    if (repoError) {
      setTokenError(repoError);
      return;
    }

    const parsed = parseGitHubRepoPath(tokenRepoUrl);
    const repoUrl = normalizeGitHubAuditTarget(tokenRepoUrl);
    if (!parsed || !repoUrl) {
      setTokenError(getFeaturedRepoValidationMessage(tokenRepoUrl));
      return;
    }

    setTokenConfirming(true);
    setTokenError(null);

    try {
      const response = await fetchWithAuth("/api/verify-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: parsed.owner,
          repo: parsed.repo,
          expectedToken: verificationToken,
        }),
      });

      const payload = await readJsonResponse<{
        error?: string;
        verified?: boolean;
        success?: boolean;
        repo_url?: string;
      }>(response);

      if (!response.ok || !(payload.verified || payload.success)) {
        throw new Error(
          payload.error ||
            "Token not found yet. Add provix.txt at the repo root, push to main/master, then try again."
        );
      }

      const confirmedRepo =
        payload.repo_url ||
        canonicalGitHubRepoUrl(parsed.owner, parsed.repo) ||
        repoUrl;

      setTokenVerified(true);
      setGithubUrl(confirmedRepo);
      setTokenPanelOpen(false);
      setFlowStep(2);
      setTokenConfirming(false);
      try {
        await finishWithRepo(confirmedRepo, tokenEmail);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Ownership verified, but profile save failed."
        );
      }
    } catch (confirmError) {
      setTokenError(
        confirmError instanceof Error
          ? confirmError.message
          : "Could not confirm token ownership."
      );
      setTokenConfirming(false);
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

  if (checkingRole || !accountRole) {
    return <OnboardingSkeleton />;
  }

  const isEmployer = accountRole === "business";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card
        interactive={false}
        className={`w-full p-8 ${activeStep === 3 ? "max-w-lg" : "max-w-md"}`}
      >
        <div className="mb-6 flex justify-center">
          <ProvixLogo />
        </div>
        <h1 className="text-2xl font-extrabold text-textMain tracking-tight text-center">
          {isEmployer
            ? "Set up your company"
            : activeStep === 3
              ? "Live Processing"
              : activeStep === 2
                ? "Submit Your Featured Repository"
                : "Verify your repository"}
        </h1>
        <p className="text-sm text-textMuted text-center mb-8">
          {isEmployer
            ? "Tell us about your team so we can match you with the Provix Talent Network."
            : activeStep === 3
              ? "Provix is screening your featured repository. This usually takes about a minute."
              : activeStep === 2
                ? "Submit the codebase that best represents your engineering standards."
                : "Connect GitHub or prove repo ownership with a token before unlocking your featured repository benchmark."}
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
          <div className="flex flex-col gap-4">
            {activeStep === 1 ? (
              <div className="space-y-3 rounded-xl border border-border bg-panel/60 px-4 py-4">
                <p className="text-xs leading-relaxed text-textMuted">
                  Identity verification is required before you can enter a
                  featured repository or unlock the benchmark.
                </p>
                <Button
                  type="button"
                  disabled={linkingGithub || saving || initializingAudit}
                  onClick={() => void handleConnectGitHub()}
                  className="w-full"
                >
                  {linkingGithub ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <GitHubLogo className="mr-2 h-4 w-4" />
                  )}
                  {linkingGithub ? "Connecting GitHub…" : "Connect with GitHub"}
                </Button>
                <button
                  type="button"
                  disabled={linkingGithub || saving || initializingAudit}
                  onClick={openTokenPanel}
                  className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-transparent px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Verify Repository Ownership with Token
                </button>
                <div
                  aria-disabled
                  className="rounded-xl border border-dashed border-border/80 bg-panel/30 px-4 py-5 opacity-60"
                >
                  <p className="text-sm font-medium text-textMuted">
                    Public GitHub Repository URL
                  </p>
                  <p className="mt-1 text-xs text-textMuted">
                    Locked until you connect GitHub or confirm token ownership.
                  </p>
                </div>
              </div>
            ) : null}

            {activeStep === 2 ? (
              <>
                {githubVerified ? (
                  <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <div>
                      <p className="font-semibold text-emerald-100">
                        Connected as{" "}
                        {githubUsername ? `@${githubUsername}` : "GitHub"}
                      </p>
                      <p className="mt-0.5 text-[12px] text-emerald-200/80">
                        Submit your featured repository to start the production
                        audit.
                      </p>
                    </div>
                  </div>
                ) : null}

                {tokenVerified && !githubVerified ? (
                  <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <p className="font-semibold text-emerald-100">
                      Repository ownership verified via token
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="githubUrl"
                    className="text-sm font-medium text-textMuted"
                  >
                    Public GitHub Repository URL
                  </label>
                  <input
                    id="githubUrl"
                    type="url"
                    name="githubUrl"
                    placeholder="https://github.com/username/repo-name"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    disabled={initializingAudit}
                    className={inputClass}
                  />
                  <p className="text-[11px] leading-relaxed text-textMuted">
                    Submit the codebase that best represents your engineering
                    standards. Provix will run an in-depth AST analysis, test
                    suite audit, and architecture review.
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

                <Button
                  type="button"
                  disabled={
                    initializingAudit ||
                    linkingGithub ||
                    !hasFeaturedGitHubRepository(githubUrl)
                  }
                  onClick={() => void handleRunAudit()}
                  className="w-full"
                >
                  {initializingAudit && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  )}
                  {initializingAudit ? "Initializing Audit..." : "Run Audit"}
                </Button>
                <p className="text-center text-[11px] leading-relaxed text-textMuted">
                  Audits take ~60 seconds. A benchmark score of{" "}
                  {PUBLIC_SCORECARD_THRESHOLD}+ qualifies you for the verified
                  talent roster.
                </p>
              </>
            ) : null}

            {activeStep === 3 ? (
              <div className="space-y-4">
                <div className="space-y-4 rounded-xl border border-cyan-400/25 bg-cyan-500/5 px-4 py-5">
                  <div className="flex items-center gap-3">
                    {auditScore != null ? (
                      <CheckCircle2
                        className="h-5 w-5 shrink-0 text-emerald-300"
                        aria-hidden
                      />
                    ) : auditError ? (
                      <X className="h-5 w-5 shrink-0 text-red-300" aria-hidden />
                    ) : (
                      <Loader2
                        className="h-5 w-5 shrink-0 animate-spin text-cyan-300"
                        aria-hidden
                      />
                    )}
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">
                        Telemetry
                      </p>
                      <p className="mt-1 text-sm font-semibold text-textMain">
                        {auditError
                          ? "Audit interrupted"
                          : auditScore != null
                            ? "Benchmark ready"
                            : AUDIT_TELEMETRY_STAGES[telemetryStage]}
                      </p>
                    </div>
                  </div>

                  <p className="break-all font-mono text-[11px] text-textMuted">
                    {auditingRepoUrl || githubUrl}
                  </p>

                  <ul className="space-y-2">
                    {AUDIT_TELEMETRY_STAGES.map((stage, index) => {
                      const complete =
                        auditScore != null ||
                        (!auditError && index < telemetryStage);
                      const active =
                        !auditError &&
                        auditScore == null &&
                        index === telemetryStage;
                      return (
                        <li
                          key={stage}
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            active
                              ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                              : complete
                                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200/90"
                                : "border-border/60 bg-panel/40 text-textMuted"
                          }`}
                        >
                          {stage}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {auditScore != null &&
                auditScore < PUBLIC_SCORECARD_THRESHOLD ? (
                  <div className="space-y-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-5">
                    <h3 className="text-xl font-extrabold tracking-tight text-textMain">
                      Score: {auditScore}/100 — Needs Improvement
                    </h3>
                    <p className="text-sm leading-relaxed text-textMuted">
                      You haven&apos;t hit the {PUBLIC_SCORECARD_THRESHOLD}-point
                      threshold for the verified candidate roster yet, but your
                      repository data is completely confidential.
                    </p>
                    <p className="text-sm leading-relaxed text-textMuted">
                      Treat this as an automated code health check. Use Provix to
                      audit your repository structure, harden edge cases, and add
                      test pipelines. Once you push new commits to GitHub, you can
                      re-evaluate from your dashboard to qualify.
                    </p>
                    <Button
                      type="button"
                      onClick={goToDashboard}
                      className="w-full"
                    >
                      Continue to Dashboard
                    </Button>
                    <button
                      type="button"
                      onClick={resetToRepositoryStep}
                      className="inline-flex w-full cursor-pointer items-center justify-center px-4 py-2 text-sm font-semibold text-textMuted transition-colors hover:text-textMain"
                    >
                      Try Another Repository
                    </button>
                  </div>
                ) : null}

                {auditScore != null &&
                auditScore >= PUBLIC_SCORECARD_THRESHOLD ? (
                  <div className="space-y-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-5">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">
                      Verified Roster Qualified • Production Grade
                    </p>
                    <h3 className="text-xl font-extrabold tracking-tight text-textMain">
                      Score: {auditScore}/100
                    </h3>
                    <p className="text-sm leading-relaxed text-emerald-100/90">
                      Your repository met our production readiness benchmarks
                      across architecture, testing, and error handling. You&apos;ve
                      earned a verified spot on the Provix talent roster.
                    </p>
                    <p className="text-sm leading-relaxed text-emerald-100/80">
                      Confirm your primary engineering focus and experience level
                      below to activate your placement.
                    </p>

                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="experienceLevel"
                        className="text-sm font-medium text-emerald-100/90"
                      >
                        Experience Level
                      </label>
                      <select
                        id="experienceLevel"
                        name="experienceLevel"
                        value={experienceLevel}
                        onChange={(e) =>
                          setExperienceLevel(e.target.value as ExperienceLevel)
                        }
                        disabled={joiningNetwork}
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
                      <label className="text-sm font-medium text-emerald-100/90">
                        Primary Skills
                      </label>
                      <SkillPicker
                        selected={primarySkills}
                        onChange={setPrimarySkills}
                        disabled={joiningNetwork}
                      />
                      <p className="text-[11px] text-emerald-100/60">
                        Pre-filled from detected repository languages and
                        frameworks when available.
                      </p>
                    </div>

                    <Button
                      type="button"
                      disabled={joiningNetwork || primarySkills.length === 0}
                      onClick={() => void finalizePlacement(true)}
                      className="w-full"
                    >
                      {joiningNetwork ? (
                        <Loader2
                          className="mr-2 h-4 w-4 animate-spin"
                          aria-hidden
                        />
                      ) : null}
                      {joiningNetwork
                        ? "Activating…"
                        : "Enter Talent Network"}
                    </Button>
                    <button
                      type="button"
                      disabled={joiningNetwork}
                      onClick={() => void finalizePlacement(false)}
                      className="inline-flex w-full cursor-pointer items-center justify-center px-4 py-2 text-sm font-semibold text-emerald-100/70 transition-colors hover:text-emerald-50 disabled:opacity-50"
                    >
                      Explore platform without joining network
                    </button>
                  </div>
                ) : null}

                {auditError ? (
                  <div className="space-y-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-4">
                    <p
                      role="alert"
                      className="text-xs leading-relaxed text-red-200"
                    >
                      {auditError}
                    </p>
                    <Button
                      type="button"
                      onClick={handleReEvaluateLatestCommit}
                      className="w-full"
                    >
                      Re-Evaluate Latest Commit
                    </Button>
                    <button
                      type="button"
                      onClick={resetToRepositoryStep}
                      className="inline-flex w-full cursor-pointer items-center justify-center px-4 py-2 text-sm font-semibold text-textMuted transition-colors hover:text-textMain"
                    >
                      Try Another Repository
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {tokenPanelOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="token-verify-title"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setTokenPanelOpen(false)}
              disabled={tokenConfirming || saving}
              className="absolute right-3 top-3 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-textMuted transition-colors hover:bg-panel hover:text-textMain disabled:opacity-50"
              aria-label="Close token verification"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <p className="text-[11px] font-bold uppercase tracking-widest text-brand">
              Token verification
            </p>
            <h2
              id="token-verify-title"
              className="mt-2 text-xl font-extrabold tracking-tight text-textMain"
            >
              Prove repository ownership
            </h2>

            <ol className="mt-5 space-y-4 text-sm text-textMuted">
              <li className="space-y-2">
                <p className="font-semibold text-textMain">
                  Step 1 — Repository & contact email
                </p>
                <input
                  type="url"
                  placeholder="https://github.com/username/repo-name"
                  value={tokenRepoUrl}
                  onChange={(e) => setTokenRepoUrl(e.target.value)}
                  className={inputClass + " w-full"}
                />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={tokenEmail}
                  onChange={(e) => setTokenEmail(e.target.value)}
                  className={inputClass + " w-full"}
                />
                {parsedTokenRepo ? (
                  <p className="text-[11px] font-mono text-cyan-300/90">
                    Parsed: {parsedTokenRepo.owner}/{parsedTokenRepo.repo}
                  </p>
                ) : null}
              </li>

              <li className="space-y-2">
                <p className="font-semibold text-textMain">
                  Step 2 — One-time verification token
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-border bg-panel px-3 py-2 font-mono text-xs text-textMain">
                    {verificationToken || "Sign in to generate a token"}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyVerificationToken()}
                    disabled={!verificationToken}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-panel px-3 py-2 text-xs font-semibold text-textMain hover:bg-surface disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    {tokenCopied ? "Copied" : "Copy"}
                  </button>
                </div>
              </li>

              <li className="space-y-1">
                <p className="font-semibold text-textMain">
                  Step 3 — Commit the token
                </p>
                <p className="text-xs leading-relaxed">
                  Create{" "}
                  <span className="font-mono text-textMain">{PROVIX_FILENAME}</span>{" "}
                  at the repository root (or paste the token into the public
                  repository description), then push to{" "}
                  <span className="font-mono text-textMain">main</span> or{" "}
                  <span className="font-mono text-textMain">master</span>. The
                  file must contain only the token.
                </p>
              </li>

              <li className="space-y-2">
                <p className="font-semibold text-textMain">
                  Step 4 — Confirm & unlock
                </p>
                <Button
                  type="button"
                  disabled={tokenConfirming || saving || !verificationToken}
                  onClick={() => void confirmTokenAndUnlock()}
                  className="w-full"
                >
                  {(tokenConfirming || saving) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  )}
                  {tokenConfirming || saving
                    ? "Confirming…"
                    : "Confirm Token & Unlock Benchmark"}
                </Button>
              </li>
            </ol>

            {tokenError ? (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-200"
              >
                {tokenError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
