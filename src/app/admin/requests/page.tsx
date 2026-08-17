"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Loader2,
  Mail,
  Search,
  Shield,
} from "lucide-react";
import SignOutButton from "@/components/SignOutButton";
import { ProvixLogo } from "@/components/ProvixLogo";
import { isAdminUser } from "@/lib/admin-access";
import { createClient } from "@/utils/supabase/client";

type AdminAuthState = "loading" | "authorized" | "unauthorized" | "unauthenticated";

type IntroRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "declined"
  | "completed";

type IntroRequestRow = {
  id: string;
  candidate_name: string | null;
  candidate_id: string;
  company_name: string | null;
  work_email: string | null;
  role_title: string;
  compensation_band: string | null;
  status: IntroRequestStatus;
  terms_accepted?: boolean | null;
  terms_agreed_at?: string | null;
  created_at: string;
  candidate_dossier?: CandidateDossier | null;
};

type CandidateDossier = {
  id: string;
  full_name?: string | null;
  codename_alias?: string | null;
  contact_email?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
  bio?: string | null;
  major?: string | null;
  headline?: string | null;
  job_title?: string | null;
};

type StatusFilter = "all" | "pending" | "approved" | "rejected";
type PipelineTab = "intros" | "job_interest";

type JobInterestApplicant = {
  id: string;
  candidate_id: string;
  created_at: string;
  candidate_dossier?: CandidateDossier | null;
};

type JobInterestRow = {
  job_id: string;
  title: string;
  company: string | null;
  employer_id: string;
  created_at: string;
  interest_count: number;
  applicants: JobInterestApplicant[];
};

const PIPELINE_TABS: { id: PipelineTab; label: string }[] = [
  { id: "intros", label: "Warm Intros" },
  { id: "job_interest", label: "Job Interest" },
];

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function normalizeStatus(status: string): IntroRequestStatus {
  const normalized = status.toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "approved" ||
    normalized === "rejected" ||
    normalized === "declined" ||
    normalized === "completed"
  ) {
    return normalized as IntroRequestStatus;
  }
  return "pending";
}

function matchesStatusFilter(
  status: IntroRequestStatus,
  filter: StatusFilter
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "rejected") {
    return status === "rejected" || status === "declined";
  }
  return status === filter;
}

function getStatusBadgeClass(status: IntroRequestStatus): string {
  if (status === "approved" || status === "completed") {
    return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  }
  if (status === "rejected" || status === "declined") {
    return "text-red-400 bg-red-500/10 border-red-500/30";
  }
  return "text-amber-400 bg-amber-500/10 border-amber-500/30";
}

function getStatusLabel(status: IntroRequestStatus): string {
  if (status === "declined") {
    return "Rejected";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminIntroRequestsPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AdminAuthState>("loading");
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requests, setRequests] = useState<IntroRequestRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);
  const [pipelineTab, setPipelineTab] = useState<PipelineTab>("intros");
  const [jobInterestLoading, setJobInterestLoading] = useState(false);
  const [jobInterestRows, setJobInterestRows] = useState<JobInterestRow[]>([]);

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/requests", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      let payload: { data?: IntroRequestRow[]; error?: string } = {};
      try {
        payload = (await response.json()) as {
          data?: IntroRequestRow[];
          error?: string;
        };
      } catch (parseError) {
        console.error("Admin requests response parse failed:", parseError);
      }

      if (response.status === 401) {
        setAuthState("unauthenticated");
        setRequests([]);
        return;
      }

      if (response.status === 403) {
        setAuthState("unauthorized");
        setError("Unauthorized: Admin access required.");
        setRequests([]);
        return;
      }

      if (!response.ok) {
        setError(payload.error || "Could not load intro requests. Please try again.");
        setRequests([]);
        return;
      }

      setRequests(
        (payload.data ?? []).map((row) => ({
          ...row,
          status: normalizeStatus(row.status),
        }))
      );
    } catch (fetchError) {
      console.error("Admin requests fetch failed:", fetchError);
      setError("Could not load intro requests. Please try again.");
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const fetchJobInterest = useCallback(async () => {
    setJobInterestLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/job-applications", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      let payload: { data?: JobInterestRow[]; error?: string } = {};
      try {
        payload = (await response.json()) as {
          data?: JobInterestRow[];
          error?: string;
        };
      } catch (parseError) {
        console.error("Admin job interest response parse failed:", parseError);
      }

      if (response.status === 401) {
        setAuthState("unauthenticated");
        setJobInterestRows([]);
        return;
      }

      if (response.status === 403) {
        setAuthState("unauthorized");
        setError("Unauthorized: Admin access required.");
        setJobInterestRows([]);
        return;
      }

      if (!response.ok) {
        setError(payload.error || "Could not load job interest submissions.");
        setJobInterestRows([]);
        return;
      }

      setJobInterestRows(payload.data ?? []);
    } catch (fetchError) {
      console.error("Admin job interest fetch failed:", fetchError);
      setError("Could not load job interest submissions.");
      setJobInterestRows([]);
    } finally {
      setJobInterestLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const resolveAuthState = (session: Session | null) => {
      if (!active) {
        return;
      }

      if (!session?.user) {
        setAuthState("unauthenticated");
        return;
      }

      if (isAdminUser(session.user)) {
        setAuthState("authorized");
        return;
      }

      setAuthState("unauthorized");
    };

    const loadSession = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        resolveAuthState(session);
      } catch (sessionLoadError) {
        console.error("Admin session check failed:", sessionLoadError);
        if (active) {
          setAuthState("unauthenticated");
        }
      }
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveAuthState(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authState === "unauthenticated") {
      router.replace("/login?next=/admin/requests");
    }
  }, [authState, router]);

  useEffect(() => {
    if (authState !== "authorized") {
      return;
    }

    if (pipelineTab === "intros") {
      void fetchRequests();
      return;
    }

    void fetchJobInterest();
  }, [authState, pipelineTab, fetchRequests, fetchJobInterest]);

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return requests.filter((request) => {
      if (!matchesStatusFilter(request.status, statusFilter)) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        request.candidate_name,
        request.company_name,
        request.work_email,
        request.role_title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [requests, searchQuery, statusFilter]);

  const filteredJobInterestRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return jobInterestRows.filter((row) => {
      if (!query) {
        return true;
      }

      const haystack = [row.title, row.company]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [jobInterestRows, searchQuery]);

  const totalJobInterestCount = useMemo(
    () => jobInterestRows.reduce((sum, row) => sum + row.interest_count, 0),
    [jobInterestRows]
  );

  const updateRequestStatus = async (id: string, status: "rejected") => {
    setUpdatingId(id);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/reject", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId: id }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        setError(payload.error || "Could not reject intro request.");
        return;
      }

      setRequests((current) =>
        current.map((request) =>
          request.id === id ? { ...request, status } : request
        )
      );
    } catch {
      setError("Could not reject intro request.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleApprove = async (requestId: string) => {
    setApprovingId(requestId);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/approve", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: requestId, requestId }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: { status?: string };
      };

      if (!response.ok || !payload.success) {
        console.error("Admin approve failed:", payload);
        setError(payload.error || "Could not approve and send intro email.");
        return;
      }

      setRequests((current) =>
        current.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status: normalizeStatus(payload.data?.status ?? "approved"),
              }
            : request
        )
      );
      setSuccessMessage("Intro email sent and request approved.");
    } catch (approveError) {
      console.error("Admin approve failed:", approveError);
      setError("Could not approve and send intro email.");
    } finally {
      setApprovingId(null);
    }
  };

  const handleCopyEmail = async (id: string, email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmailId(id);
      window.setTimeout(() => setCopiedEmailId(null), 2000);
    } catch {
      setError("Could not copy email to clipboard.");
    }
  };

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-slate-200 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" aria-hidden />
          Loading admin dashboard...
        </div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-slate-200 flex items-center justify-center p-6">
        <p className="text-sm text-slate-400">Redirecting to sign in...</p>
      </div>
    );
  }

  if (authState === "unauthorized") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-[#111111] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-300">
            <Shield className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-xl font-bold text-white">
            Unauthorized: Admin Access Required
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Your account is signed in, but it does not have permission to view the
            admin intro pipeline.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200">
      <header className="border-b border-slate-800/80 bg-[#0A0A0A]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="hover:opacity-90 transition-opacity shrink-0">
            <ProvixLogo />
          </Link>
          <SignOutButton redirectTo="/" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2">
              <Shield className="w-4 h-4" aria-hidden />
              Admin Console
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-extrabold tracking-tight text-white">
                Admin Pipeline
              </h1>
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs font-bold text-slate-300">
                {pipelineTab === "intros"
                  ? `${filteredRequests.length} intro requests`
                  : `${totalJobInterestCount} interested candidates`}
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-2">
              {pipelineTab === "intros"
                ? "Review employer warm intro requests and approve or reject pipeline entries."
                : "See which candidates expressed interest in each posted role."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PIPELINE_TABS.map((tab) => {
            const isActive = pipelineTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPipelineTab(tab.id)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="bg-[#111111] rounded-2xl border border-slate-800/60 p-5 shadow-2xl space-y-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              aria-hidden
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={
                pipelineTab === "intros"
                  ? "Search candidate, company, or email..."
                  : "Search job title or company..."
              }
              className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {pipelineTab === "intros" && (
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => {
                const isActive = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      isActive
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
            {successMessage}
          </div>
        )}

        <div className="bg-[#111111] rounded-2xl border border-slate-800/60 shadow-2xl overflow-hidden">
          {pipelineTab === "job_interest" ? (
            jobInterestLoading ? (
              <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" aria-hidden />
                Loading job interest submissions...
              </div>
            ) : filteredJobInterestRows.length === 0 ? (
              <div className="py-20 text-center px-6">
                <p className="text-sm text-slate-400">
                  No job interest submissions match your current filters.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {filteredJobInterestRows.map((row) => (
                  <div key={row.job_id} className="p-5 space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-white text-lg">
                          {row.title}
                        </div>
                        <div className="text-sm text-slate-400 mt-1">
                          {row.company || "—"}
                        </div>
                        <div className="text-[10px] text-slate-600 mt-1">
                          Posted {formatDate(row.created_at)}
                        </div>
                      </div>
                      <span className="inline-flex self-start items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-300">
                        {row.interest_count} interested
                      </span>
                    </div>

                    {row.applicants.length > 0 ? (
                      <div className="space-y-3">
                        {row.applicants.map((applicant) => (
                          <div
                            key={applicant.id}
                            className="rounded-xl border border-slate-800 bg-[#0A0A0A] p-4"
                          >
                            <div className="font-medium text-white">
                              {applicant.candidate_dossier?.full_name ||
                                applicant.candidate_dossier?.codename_alias ||
                                "Candidate"}
                            </div>
                            {applicant.candidate_dossier?.codename_alias && (
                              <div className="text-[11px] text-slate-500 mt-1">
                                Public alias:{" "}
                                {applicant.candidate_dossier.codename_alias}
                              </div>
                            )}
                            <div className="text-[10px] text-slate-600 mt-1">
                              Expressed interest {formatDate(applicant.created_at)}
                            </div>
                            {applicant.candidate_dossier && (
                              <div className="mt-3 text-[11px] text-slate-300 space-y-1">
                                {(applicant.candidate_dossier.contact_email ||
                                  applicant.candidate_dossier.email) && (
                                  <p>
                                    Email:{" "}
                                    {applicant.candidate_dossier.contact_email ||
                                      applicant.candidate_dossier.email}
                                  </p>
                                )}
                                {applicant.candidate_dossier.headline && (
                                  <p>Headline: {applicant.candidate_dossier.headline}</p>
                                )}
                                {applicant.candidate_dossier.portfolio_url && (
                                  <p>
                                    Portfolio:{" "}
                                    {applicant.candidate_dossier.portfolio_url}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        No candidates have expressed interest yet.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : requestsLoading ? (
            <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" aria-hidden />
              Loading intro requests...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-20 text-center px-6">
              <p className="text-sm text-slate-400">
                No intro requests match your current filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#0A0A0A] border-b border-slate-800">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-4 font-bold">Candidate & Role</th>
                    <th className="px-5 py-4 font-bold">Company</th>
                    <th className="px-5 py-4 font-bold">Work Email</th>
                    <th className="px-5 py-4 font-bold">Comp Band</th>
                    <th className="px-5 py-4 font-bold">Status</th>
                    <th className="px-5 py-4 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredRequests.map((request) => {
                    const email = request.work_email ?? "";
                    const isUpdating = updatingId === request.id;
                    const isApproving = approvingId === request.id;

                    return (
                      <tr
                        key={request.id}
                        className="hover:bg-slate-900/30 transition-colors"
                      >
                        <td className="px-5 py-4 align-top">
                          <div className="font-semibold text-white">
                            {request.candidate_dossier?.full_name ||
                              request.candidate_dossier?.codename_alias ||
                              request.candidate_name ||
                              "Candidate"}
                          </div>
                          {request.candidate_dossier?.codename_alias && (
                            <div className="text-[11px] text-slate-500 mt-1">
                              Public alias: {request.candidate_dossier.codename_alias}
                            </div>
                          )}
                          <div className="text-xs text-slate-400 mt-1">
                            {request.role_title}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-1">
                            {formatDate(request.created_at)}
                          </div>
                          {request.terms_accepted && (
                            <div className="text-[10px] text-emerald-400 mt-2">
                              Terms agreed
                              {request.terms_agreed_at
                                ? ` · ${formatDate(request.terms_agreed_at)}`
                                : ""}
                            </div>
                          )}
                          {request.candidate_dossier && (
                            <div className="mt-3 rounded-xl border border-slate-800 bg-[#0A0A0A] p-3 space-y-1.5 text-[11px] text-slate-300">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Candidate dossier
                              </p>
                              {(request.candidate_dossier.contact_email ||
                                request.candidate_dossier.email) && (
                                <p>
                                  Email:{" "}
                                  <a
                                    href={`mailto:${request.candidate_dossier.contact_email || request.candidate_dossier.email}`}
                                    className="text-indigo-400 hover:text-indigo-300 break-all"
                                  >
                                    {request.candidate_dossier.contact_email ||
                                      request.candidate_dossier.email}
                                  </a>
                                </p>
                              )}
                              {request.candidate_dossier.phone && (
                                <p>Phone: {request.candidate_dossier.phone}</p>
                              )}
                              {request.candidate_dossier.linkedin_url && (
                                <p>
                                  LinkedIn:{" "}
                                  <a
                                    href={request.candidate_dossier.linkedin_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-400 hover:text-indigo-300 break-all"
                                  >
                                    {request.candidate_dossier.linkedin_url}
                                  </a>
                                </p>
                              )}
                              {request.candidate_dossier.portfolio_url && (
                                <p>
                                  Portfolio:{" "}
                                  <a
                                    href={request.candidate_dossier.portfolio_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-400 hover:text-indigo-300 break-all"
                                  >
                                    {request.candidate_dossier.portfolio_url}
                                  </a>
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 align-top text-slate-300">
                          {request.company_name || "—"}
                        </td>
                        <td className="px-5 py-4 align-top">
                          {email ? (
                            <div className="flex items-center gap-2">
                              <a
                                href={`mailto:${email}`}
                                className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors"
                              >
                                <Mail className="w-3.5 h-3.5" aria-hidden />
                                <span className="break-all">{email}</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => void handleCopyEmail(request.id, email)}
                                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-800/40 p-1.5 text-slate-400 hover:text-white hover:border-indigo-500/40 transition-colors"
                                aria-label={`Copy ${email}`}
                              >
                                {copiedEmailId === request.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" aria-hidden />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 align-top text-slate-300">
                          {request.compensation_band || "—"}
                        </td>
                        <td className="px-5 py-4 align-top">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${getStatusBadgeClass(request.status)}`}
                          >
                            {getStatusLabel(request.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={
                                isApproving ||
                                isUpdating ||
                                request.status === "approved"
                              }
                              onClick={() => void handleApprove(request.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {isApproving ? (
                                <>
                                  <Loader2
                                    className="w-3.5 h-3.5 animate-spin"
                                    aria-hidden
                                  />
                                  Sending...
                                </>
                              ) : (
                                "Approve"
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={
                                isUpdating ||
                                isApproving ||
                                request.status === "rejected" ||
                                request.status === "declined"
                              }
                              onClick={() =>
                                void updateRequestStatus(request.id, "rejected")
                              }
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
