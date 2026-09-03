"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  getCandidateIntroStatusBadgeClass,
  getCandidateIntroStatusLabel,
  isCandidateIntroDismissed,
  normalizeCandidateIntroStatus,
  resolveIntroCompanyEmail,
  resolveIntroCompensationRange,
  resolveIntroTargetRole,
  type CandidateIntroInboxFilter,
  type CandidateIntroRequestRow,
} from "@/lib/candidate-intro-requests";
import { formatRelativeTime } from "@/lib/format-relative-time";

type CandidateIntroRequestsPanelProps = {
  requests: CandidateIntroRequestRow[];
  loading: boolean;
  error: string | null;
  respondingId: string | null;
  onRetry: () => void;
  onDismiss: (introId: string, dismissed: boolean) => void | Promise<void>;
  onRespond: (
    introId: string,
    action: "accept" | "decline"
  ) => void | Promise<void>;
};

export default function CandidateIntroRequestsPanel({
  requests,
  loading,
  error,
  respondingId,
  onRetry,
  onDismiss,
  onRespond,
}: CandidateIntroRequestsPanelProps) {
  const [inboxFilter, setInboxFilter] =
    useState<CandidateIntroInboxFilter>("inbox");

  const inboxRequests = useMemo(
    () => requests.filter((request) => !isCandidateIntroDismissed(request)),
    [requests]
  );
  const dismissedRequests = useMemo(
    () => requests.filter((request) => isCandidateIntroDismissed(request)),
    [requests]
  );
  const visibleRequests =
    inboxFilter === "dismissed" ? dismissedRequests : inboxRequests;
  const pendingCount = inboxRequests.filter(
    (request) => normalizeCandidateIntroStatus(request.status) === "pending"
  ).length;
  const acceptedCount = inboxRequests.filter(
    (request) => normalizeCandidateIntroStatus(request.status) === "accepted"
  ).length;

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
          Warm Intros
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          Intro Requests
        </h1>
        <p className="text-zinc-300 text-sm mt-2">
          Review employer introduction requests and approve the ones you want to
          pursue.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
            Pending Review
          </span>
          <span className="text-3xl font-extrabold text-amber-400">
            {loading ? "—" : pendingCount}
          </span>
        </div>
        <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
            Accepted
          </span>
          <span className="text-3xl font-extrabold text-emerald-400">
            {loading ? "—" : acceptedCount}
          </span>
        </div>
        <div className="card-edge bg-[#111111] p-5 rounded-2xl border border-zinc-800 shadow-lg">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
            Total Requests
          </span>
          <span className="text-3xl font-extrabold text-white">
            {loading ? "—" : inboxRequests.length}
          </span>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Intro request folders"
        className="mb-8 inline-flex w-full sm:w-auto rounded-xl border border-zinc-700 bg-[#111111] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={inboxFilter === "inbox"}
          onClick={() => setInboxFilter("inbox")}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            inboxFilter === "inbox"
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Inbox
          {!loading ? ` (${inboxRequests.length})` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inboxFilter === "dismissed"}
          onClick={() => setInboxFilter("dismissed")}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            inboxFilter === "dismissed"
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Dismissed
          {!loading ? ` (${dismissedRequests.length})` : ""}
        </button>
      </div>

      {loading ? (
        <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-slate-400">
            Loading intro requests...
          </p>
        </div>
      ) : error ? (
        <div className="card-edge bg-[#111111] border border-red-500/20 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-red-200">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 text-red-200 font-semibold py-2 px-4 rounded-lg text-xs transition-all cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : requests.length === 0 ? (
        <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-slate-300">
            No intro requests yet
          </p>
          <p className="text-xs text-slate-500 mt-1">
            When employers request a warm introduction, they will appear here
            for your review.
          </p>
        </div>
      ) : visibleRequests.length === 0 ? (
        <div className="card-edge bg-[#111111] border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-slate-300">
            {inboxFilter === "dismissed"
              ? "No dismissed intro requests"
              : "Inbox is empty"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {inboxFilter === "dismissed"
              ? "Requests you trash or dismiss will show up here so you can restore them later."
              : "Dismissed requests are hidden here. Switch to Dismissed to review them."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleRequests.map((request) => {
            const originalStatus = normalizeCandidateIntroStatus(request.status);
            const isDismissed = isCandidateIntroDismissed(request);
            const status = isDismissed ? "dismissed" : originalStatus;
            const isPending = originalStatus === "pending";
            const isResponding = respondingId === request.id;
            const companyName =
              request.company_name?.trim() || "Verified employer";
            const companyEmail = resolveIntroCompanyEmail(request);
            const targetRole = resolveIntroTargetRole(request);
            const compensationRange = resolveIntroCompensationRange(request);

            return (
              <div
                key={request.id}
                className="card-edge card-lift bg-[#111111] border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-base truncate">
                      {companyName}
                    </h3>
                    <p className="text-sm text-indigo-400 font-medium mt-0.5 truncate">
                      {targetRole}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      {formatRelativeTime(request.created_at)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${getCandidateIntroStatusBadgeClass(status)}`}
                  >
                    {getCandidateIntroStatusLabel(status)}
                  </span>
                </div>

                <div className="rounded-xl bg-[#0A0A0A] border border-zinc-800 p-3 mb-4 space-y-2">
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-slate-500 uppercase tracking-widest font-bold">
                      Contact
                    </span>
                    <span className="text-slate-300 text-right break-all">
                      {companyEmail || "Not provided"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-slate-500 uppercase tracking-widest font-bold">
                      Compensation
                    </span>
                    <span className="text-emerald-400 font-semibold text-right">
                      {compensationRange}
                    </span>
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-zinc-800">
                  {isDismissed ? (
                    <button
                      type="button"
                      onClick={() => void onDismiss(request.id, false)}
                      disabled={isResponding}
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-lg border border-zinc-700 text-slate-200 hover:text-white hover:border-slate-500 transition-all cursor-pointer disabled:opacity-60"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {isResponding ? "Saving..." : "Restore"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label="Dismiss intro request"
                        onClick={() => void onDismiss(request.id, true)}
                        disabled={isResponding}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-lg border border-zinc-700 text-slate-300 hover:text-red-200 hover:border-red-500/40 hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {isResponding ? "Saving..." : "Dismiss"}
                      </button>
                      {isPending ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void onRespond(request.id, "decline")}
                            disabled={isResponding}
                            className="text-[11px] font-bold px-4 py-2 rounded-lg border border-zinc-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-all cursor-pointer disabled:opacity-60"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => void onRespond(request.id, "accept")}
                            disabled={isResponding}
                            className="text-[11px] font-bold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer disabled:opacity-60"
                          >
                            {isResponding ? "Saving..." : "Accept Intro"}
                          </button>
                        </>
                      ) : (
                        <p className="w-full sm:w-auto text-xs text-slate-500 sm:mr-auto sm:order-first">
                          {originalStatus === "accepted"
                            ? "You accepted this intro. Check your inbox for the mutual introduction email."
                            : "You declined this introduction request."}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
