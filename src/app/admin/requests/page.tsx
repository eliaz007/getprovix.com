"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { createClient } from "@/utils/supabase/client";

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
  created_at: string;
};

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function normalizeStatus(status: string): IntroRequestStatus {
  if (
    status === "pending" ||
    status === "approved" ||
    status === "rejected" ||
    status === "declined" ||
    status === "completed"
  ) {
    return status;
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
  const [authChecking, setAuthChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<IntroRequestRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("intro_requests")
      .select(
        "id, candidate_name, candidate_id, company_name, work_email, role_title, compensation_band, status, created_at"
      )
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(
        "Could not load intro requests. Ensure your account has admin access."
      );
      setRequests([]);
      setLoading(false);
      return;
    }

    setRequests(
      (data ?? []).map((row) => ({
        ...row,
        status: normalizeStatus(row.status),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const verifyAndLoad = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      const isAdmin =
        !!user &&
        (user.email === "eliasdiangelo91@gmail.com" ||
          user.user_metadata?.role === "admin");

      if (!isAdmin) {
        router.replace("/login");
        return;
      }

      setAuthChecking(false);
      await fetchRequests();
    };

    void verifyAndLoad();

    return () => {
      cancelled = true;
    };
  }, [fetchRequests, router]);

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

  const updateRequestStatus = async (
    id: string,
    status: "rejected"
  ) => {
    setUpdatingId(id);
    setError(null);
    setSuccessMessage(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("intro_requests")
      .update({ status })
      .eq("id", id);

    if (updateError) {
      setError("Could not update request status. Please try again.");
      setUpdatingId(null);
      return;
    }

    setRequests((current) =>
      current.map((request) =>
        request.id === id ? { ...request, status } : request
      )
    );
    setUpdatingId(null);
  };

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/send-intro", {
        method: "POST",
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
        setError(payload.error || "Could not approve and send intro email.");
        return;
      }

      setRequests((current) =>
        current.map((request) =>
          request.id === id ? { ...request, status: "approved" } : request
        )
      );
      setSuccessMessage("Intro email sent and request approved.");
    } catch {
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

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-slate-200 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" aria-hidden />
          Verifying session...
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
          <SignOutButton redirectTo="/login" />
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
                Warm Intro Pipeline
              </h1>
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs font-bold text-slate-300">
                {filteredRequests.length} shown
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-2">
              Review employer warm intro requests and approve or reject pipeline
              entries.
            </p>
          </div>
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
              placeholder="Search candidate, company, or email..."
              className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

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
          {loading ? (
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
                            {request.candidate_name || "Candidate"}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {request.role_title}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-1">
                            {formatDate(request.created_at)}
                          </div>
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
