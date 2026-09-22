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

const OBSIDIAN_CARD =
  "bg-zinc-900/50 border border-white/[0.08] rounded-xl p-5 shadow-xl backdrop-blur-md";
const FEED_CARD =
  "bg-zinc-900/50 border border-white/[0.08] rounded-xl p-5 shadow-2xl hover:border-white/[0.14] transition-all";
const STAT_LABEL =
  "font-mono text-[11px] uppercase tracking-wider text-zinc-400";
const MICRO_BADGE =
  "bg-violet-500/10 border border-violet-500/20 text-violet-300 font-mono text-[10px] px-1.5 py-0.5 rounded";

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

function statValueClass(active: boolean) {
  return active
    ? "font-mono text-2xl font-bold text-violet-400"
    : "font-mono text-2xl font-bold text-zinc-100";
}

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
    <div className="text-zinc-100">
      <div className="mb-8">
        <p className="font-mono text-xs font-medium uppercase tracking-widest text-zinc-500">
          Intro Requests
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
          Intro Requests
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Review employer introduction requests and approve the ones you want to
          pursue.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={OBSIDIAN_CARD}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className={STAT_LABEL}>Pending Review</span>
            {pendingCount > 0 ? (
              <span className={MICRO_BADGE}>New</span>
            ) : null}
          </div>
          <span className={statValueClass(!loading && pendingCount > 0)}>
            {loading ? "—" : pendingCount}
          </span>
        </div>
        <div className={OBSIDIAN_CARD}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className={STAT_LABEL}>Accepted</span>
            {acceptedCount > 0 ? (
              <span className={MICRO_BADGE}>Signal</span>
            ) : null}
          </div>
          <span className={statValueClass(!loading && acceptedCount > 0)}>
            {loading ? "—" : acceptedCount}
          </span>
        </div>
        <div className={OBSIDIAN_CARD}>
          <span className={`${STAT_LABEL} mb-2 block`}>Total Requests</span>
          <span className={statValueClass(false)}>
            {loading ? "—" : inboxRequests.length}
          </span>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Intro request folders"
        className="mb-8 inline-flex w-full rounded-lg border border-white/[0.06] bg-[#070709] p-1 sm:w-auto"
      >
        <button
          type="button"
          role="tab"
          aria-selected={inboxFilter === "inbox"}
          onClick={() => setInboxFilter("inbox")}
          className={`flex-1 cursor-pointer rounded-md px-3.5 py-1.5 font-mono text-xs transition-colors sm:flex-none ${
            inboxFilter === "inbox"
              ? "border border-violet-500/30 bg-[#1A1A1E] font-medium text-violet-300 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
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
          className={`flex-1 cursor-pointer rounded-md px-3.5 py-1.5 font-mono text-xs transition-colors sm:flex-none ${
            inboxFilter === "dismissed"
              ? "border border-violet-500/30 bg-[#1A1A1E] font-medium text-violet-300 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Dismissed
          {!loading ? ` (${dismissedRequests.length})` : ""}
        </button>
      </div>

      {loading ? (
        <div className={`${OBSIDIAN_CARD} p-10 text-center`}>
          <p className="text-sm font-medium text-zinc-400">
            Loading intro requests...
          </p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-[#131316]/90 p-10 text-center shadow-xl backdrop-blur-md">
          <p className="text-sm font-medium text-red-200">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 cursor-pointer rounded-lg border border-white/[0.08] bg-[#1A1A1E] px-4 py-2 text-xs font-semibold text-zinc-200 transition-all hover:border-violet-500/30 hover:text-violet-300"
          >
            Retry
          </button>
        </div>
      ) : requests.length === 0 ? (
        <div className={`${OBSIDIAN_CARD} p-10 text-center`}>
          <p className="text-sm font-medium text-zinc-300">
            No intro requests yet
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            When employers request a warm introduction, they will appear here
            for your review.
          </p>
        </div>
      ) : visibleRequests.length === 0 ? (
        <div className={`${OBSIDIAN_CARD} p-10 text-center`}>
          <p className="text-sm font-medium text-zinc-300">
            {inboxFilter === "dismissed"
              ? "No dismissed intro requests"
              : "Inbox is empty"}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {inboxFilter === "dismissed"
              ? "Requests you trash or dismiss will show up here so you can restore them later."
              : "Dismissed requests are hidden here. Switch to Dismissed to review them."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              <div key={request.id} className={`flex flex-col ${FEED_CARD}`}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-zinc-100">
                      {companyName}
                    </h3>
                    <p className="mt-0.5 truncate text-sm font-medium text-violet-300">
                      {targetRole}
                    </p>
                    <p className="mt-2 font-mono text-xs text-zinc-500">
                      {formatRelativeTime(request.created_at)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 ${getCandidateIntroStatusBadgeClass(status)}`}
                  >
                    {getCandidateIntroStatusLabel(status)}
                  </span>
                </div>

                <div className="mb-1 space-y-2 rounded-lg border border-white/[0.06] bg-[#070709] p-3 font-mono text-xs text-zinc-300">
                  <div className="flex items-start justify-between gap-3">
                    <span className="uppercase tracking-widest text-zinc-500">
                      Contact
                    </span>
                    <span className="break-all text-right text-zinc-300">
                      {companyEmail || "Not provided"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="uppercase tracking-widest text-zinc-500">
                      Compensation
                    </span>
                    <span className="text-right text-violet-300">
                      {compensationRange}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-xs text-zinc-400">
                  {isDismissed ? (
                    <button
                      type="button"
                      onClick={() => void onDismiss(request.id, false)}
                      disabled={isResponding}
                      className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.08] px-4 py-2 font-mono text-[11px] font-medium text-zinc-200 transition-all hover:border-violet-500/30 hover:text-violet-300 disabled:opacity-60"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {isResponding ? "Saving..." : "Restore"}
                    </button>
                  ) : (
                    <>
                      {!isPending ? (
                        <p className="min-w-0 flex-1">
                          {originalStatus === "accepted"
                            ? "You accepted this intro. Check your inbox for the mutual introduction email."
                            : "You declined this introduction request."}
                        </p>
                      ) : (
                        <span className="min-w-0 flex-1" />
                      )}
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          aria-label="Dismiss intro request"
                          onClick={() => void onDismiss(request.id, true)}
                          disabled={isResponding}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.08] px-4 py-2 font-mono text-[11px] font-medium text-zinc-400 transition-all hover:border-white/[0.14] hover:text-zinc-200 disabled:opacity-60"
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
                              className="cursor-pointer rounded-lg border border-white/[0.08] px-4 py-2 font-mono text-[11px] font-medium text-zinc-400 transition-all hover:text-zinc-200 disabled:opacity-60"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              onClick={() => void onRespond(request.id, "accept")}
                              disabled={isResponding}
                              className="cursor-pointer rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-500 disabled:opacity-60"
                            >
                              {isResponding ? "Saving..." : "Accept Intro"}
                            </button>
                          </>
                        ) : null}
                      </div>
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
