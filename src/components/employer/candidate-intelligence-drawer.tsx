"use client";

import { useEffect, useState } from "react";
import LockedContactDossierBadge from "@/components/LockedContactDossierBadge";
import GeminiDeepScreening from "@/components/employer/gemini-deep-screening";
import ScoreMeter from "@/components/ScoreMeter";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import WorkPreferenceTimezoneBadge from "@/components/WorkPreferenceTimezoneBadge";
import { buildAlliterativeAliasIdentity } from "@/lib/alias-generator";
import { getAvailabilityBadgeClass } from "@/lib/availability-status";
import {
  getPublicCandidateInitials,
  redactPersonalNamesFromText,
} from "@/lib/candidate-anonymization";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import {
  formatTalentMatchLabel,
  getCandidateProjectLinks,
  type ScreeningJobContext,
  type TalentPoolCandidate,
} from "@/lib/talent-pool-candidate";
import {
  candidateEducationFields,
  educationFromProfileRow,
  fetchCandidateEducationForEmployer,
  hasTalentEducation,
  mergeTalentEducation,
  resolveTalentProfileId,
  type TalentPoolEducation,
} from "@/lib/talent-pool-profiles";
import { createClient } from "@/utils/supabase/client";

const DrawerIcons = {
  XMark: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  ExternalLink: () => (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  ),
};

type CandidateIntelligenceDrawerProps = {
  candidate: TalentPoolCandidate | null;
  open: boolean;
  isUnlocked: boolean;
  onClose: () => void;
  onRequestIntro: (candidate: TalentPoolCandidate) => void;
  screeningJob?: ScreeningJobContext | null;
  companyName?: string;
  requireAuth?: () => boolean;
  onToast?: (message: string) => void;
};

export default function CandidateIntelligenceDrawer({
  candidate,
  open,
  isUnlocked,
  onClose,
  onRequestIntro,
  screeningJob = null,
  companyName,
  requireAuth,
  onToast,
}: CandidateIntelligenceDrawerProps) {
  const [educationOverlay, setEducationOverlay] =
    useState<TalentPoolEducation | null>(null);

  const profileId = candidate ? resolveTalentProfileId(candidate) : "";

  useEffect(() => {
    setEducationOverlay(null);

    if (!open || !candidate) {
      return;
    }

    if (hasTalentEducation(candidateEducationFields(candidate))) {
      setEducationOverlay(null);
      return;
    }

    if (!profileId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const emptyEducation: TalentPoolEducation = {
        university: "",
        major: "",
        gpa: "",
        graduationYear: "",
      };

      const [clientEducation, apiEducation] = await Promise.all([
        fetchCandidateEducationForEmployer(supabase, profileId),
        (async () => {
          try {
            const response = await fetchWithAuth(
              `/api/talent-pool/education?profileId=${encodeURIComponent(profileId)}`
            );
            if (!response.ok) {
              return null;
            }
            const payload = (await response.json()) as Record<string, unknown>;
            return educationFromProfileRow(payload);
          } catch (error) {
            console.error("Talent pool education API failed:", error);
            return null;
          }
        })(),
      ]);

      if (cancelled) {
        return;
      }

      const education = mergeTalentEducation(
        clientEducation ?? emptyEducation,
        apiEducation ?? emptyEducation
      );

      if (!hasTalentEducation(education)) {
        return;
      }

      setEducationOverlay(education);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    profileId,
    candidate?.university,
    candidate?.major,
    candidate?.gpa,
    candidate?.graduationYear,
  ]);

  const liveCandidate = candidate
    ? educationOverlay
      ? {
          ...candidate,
          ...mergeTalentEducation(
            candidateEducationFields(candidate),
            educationOverlay
          ),
        }
      : candidate
    : null;

  const publicName = liveCandidate
    ? buildAlliterativeAliasIdentity(liveCandidate.profileId?.trim() || "").alias
    : "";
  const displayInitials = liveCandidate
    ? getPublicCandidateInitials({
        codenameAlias: publicName,
        candidateId: liveCandidate.profileId ?? liveCandidate.id,
      })
    : "";
  const lockedBio = liveCandidate
    ? redactPersonalNamesFromText(
        liveCandidate.bio ?? "",
        liveCandidate,
        publicName
      )
    : "";
  const projectLinks = liveCandidate ? getCandidateProjectLinks(liveCandidate) : [];
  const contactEmail = candidate?.email?.trim() || null;
  const contactPhone = candidate?.phone?.trim() || null;

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute top-0 right-0 h-full w-full max-w-md bg-[#121212] border-l border-zinc-800 shadow-none overflow-y-auto transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {liveCandidate && (
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between pb-5 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="relative w-11 h-11 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center font-bold text-sm shrink-0">
                  {displayInitials}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">
                    {publicName}
                  </h3>
                  <p className="text-xs text-indigo-400 font-medium mt-0.5">
                    {liveCandidate.role}
                  </p>
                  <WorkPreferenceTimezoneBadge
                    workPreference={liveCandidate.workPreference}
                    timezone={liveCandidate.timezone}
                    className="mt-2"
                  />
                  {!isUnlocked && liveCandidate.verifiedOnProvix && (
                    <div className="mt-2">
                      <VerifiedOnProvixPill />
                    </div>
                  )}
                  {isUnlocked && (
                    <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      Introduction unlocked
                    </span>
                  )}
                  <span className="inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    {liveCandidate.experienceLevel}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRequestIntro(liveCandidate)}
                    className="mt-2.5 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    Request Introduction
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-white bg-slate-900 w-7 h-7 rounded-lg border border-zinc-800 flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                <DrawerIcons.XMark />
              </button>
            </div>

            <div className="space-y-2 bg-slate-900/60 px-3.5 py-2.5 rounded-xl border border-zinc-800">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${getAvailabilityBadgeClass(
                    liveCandidate.availability
                  )}`}
                >
                  {liveCandidate.availability}
                </span>
                <span
                  className={`font-mono font-bold ${
                    liveCandidate.matchPending
                      ? "text-indigo-300 animate-pulse"
                      : "text-emerald-400"
                  }`}
                >
                  {formatTalentMatchLabel(
                    liveCandidate.matchScore,
                    liveCandidate.matchPending
                  )}{" "}
                  AI Match Score
                </span>
              </div>
              {!liveCandidate.matchPending ? (
                <ScoreMeter score={liveCandidate.matchScore} />
              ) : null}
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">{lockedBio}</p>

            <div>
              <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-2">
                Education & Credentials
              </div>
              <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3.5 text-xs text-slate-200 space-y-2">
                {liveCandidate.university ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500 shrink-0">University</span>
                    <span className="text-right">{liveCandidate.university}</span>
                  </div>
                ) : null}
                {liveCandidate.major ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500 shrink-0">Major</span>
                    <span className="text-right">{liveCandidate.major}</span>
                  </div>
                ) : null}
                {liveCandidate.gpa ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500 shrink-0">GPA</span>
                    <span className="text-right font-mono">{liveCandidate.gpa}</span>
                  </div>
                ) : null}
                {liveCandidate.graduationYear ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500 shrink-0">Graduation</span>
                    <span className="text-right">{liveCandidate.graduationYear}</span>
                  </div>
                ) : null}
                {!liveCandidate.university &&
                !liveCandidate.major &&
                !liveCandidate.gpa &&
                !liveCandidate.graduationYear ? (
                  <p className="text-slate-500">Education details not provided.</p>
                ) : null}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-2">
                Core Skills
              </div>
              <div className="flex flex-wrap gap-1.5">
                {liveCandidate.skills.map((skill, sIdx) => (
                  <span
                    key={sIdx}
                    className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-800/80 text-slate-300 border border-slate-700/50"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-2">
                Contact & Proof Links
              </div>
              {isUnlocked ? (
                <div className="space-y-2">
                  {contactEmail && (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="w-full flex items-center justify-between bg-[#0A0A0A] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs hover:border-indigo-500/40 transition-all"
                    >
                      <span className="text-indigo-300 font-medium">Email</span>
                      <span className="text-slate-300 break-all text-right ml-3 font-mono">
                        {contactEmail}
                      </span>
                    </a>
                  )}
                  {contactPhone && (
                    <div className="w-full flex items-center justify-between bg-[#0A0A0A] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs">
                      <span className="text-indigo-300 font-medium">Phone</span>
                      <span className="text-slate-300 font-mono">{contactPhone}</span>
                    </div>
                  )}
                  {projectLinks.length === 0 ? (
                    <p className="text-xs text-slate-500 italic bg-[#0A0A0A] border border-zinc-800 rounded-xl px-3.5 py-2.5">
                      No public project links provided.
                    </p>
                  ) : (
                    projectLinks.map((link) => (
                      <a
                        key={`${link.label}-${link.url}`}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-between bg-[#0A0A0A] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs hover:border-indigo-500/40 transition-all"
                      >
                        <span className="text-indigo-300 font-medium">
                          {link.label}
                        </span>
                        <DrawerIcons.ExternalLink />
                      </a>
                    ))
                  )}
                </div>
              ) : (
                <LockedContactDossierBadge />
              )}
            </div>

            <GeminiDeepScreening
              key={liveCandidate.profileId || liveCandidate.id}
              candidate={liveCandidate}
              publicName={publicName}
              lockedBio={lockedBio}
              screeningJob={screeningJob}
              companyName={companyName}
              requireAuth={requireAuth}
              onToast={onToast}
            />

            <div>
              <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-2">
                Audited Proof-of-Work Breakdown
              </div>
              <ul className="space-y-2">
                {liveCandidate.projects.map((project, pIdx) => (
                  <li
                    key={pIdx}
                    className="text-xs text-slate-300 leading-relaxed bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3.5"
                  >
                    {project}
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => onRequestIntro(liveCandidate)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Request Introduction
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
