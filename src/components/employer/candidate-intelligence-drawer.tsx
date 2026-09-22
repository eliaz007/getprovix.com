"use client";

import { useEffect, useState } from "react";
import LockedContactDossierBadge from "@/components/LockedContactDossierBadge";
import GeminiDeepScreening from "@/components/employer/gemini-deep-screening";
import ProductionCodeAuditSection from "@/components/employer/production-code-audit-section";
import ProductionScoreBadge from "@/components/employer/production-score-badge";
import ScoreMeter from "@/components/ScoreMeter";
import VerifiedOnProvixPill from "@/components/VerifiedOnProvixPill";
import WorkPreferenceTimezoneBadge from "@/components/WorkPreferenceTimezoneBadge";
import CandidateEducationSummary from "@/components/CandidateEducationSummary";
import { buildAlliterativeAliasIdentity } from "@/lib/alias-generator";
import { getAvailabilityBadgeClass } from "@/lib/availability-status";
import {
  getPublicCandidateInitials,
  redactPersonalNamesFromText,
} from "@/lib/candidate-anonymization";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  formatTalentMatchLabel,
  getCandidateProjectLinks,
  productionAuditRecordFromCandidate,
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
        isSelfTaught: false,
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
            const payload = await readJsonResponse<Record<string, unknown>>(
              response
            );
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
    candidate?.isSelfTaught,
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
        className={`absolute top-0 right-0 h-full w-full max-w-md bg-panel border-l border-border overflow-y-auto transition-transform duration-300 ease-out ${
 open ? "translate-x-0" : "translate-x-full"
 }`}
      >
        {liveCandidate && (
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between pb-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="relative w-11 h-11 rounded-full bg-brand/20 border border-brand/30 text-brand flex items-center justify-center font-bold text-sm shrink-0">
                  {displayInitials}
                </div>
                <div>
                  <h3 className="text-base font-bold text-textMain leading-tight">
                    {publicName}
                  </h3>
                  <p className="text-xs text-brand font-medium mt-0.5">
                    {liveCandidate.role}
                  </p>
                  <WorkPreferenceTimezoneBadge
                    workPreference={liveCandidate.workPreference}
                    timezone={liveCandidate.timezone}
                    className="mt-2"
                  />
                  <div className="mt-2">
                    <ProductionScoreBadge
                      score={liveCandidate.productionScore}
                      verified={Boolean(liveCandidate.isAuditVerified)}
                    />
                  </div>
                  {(liveCandidate.verifiedOnProvix || isUnlocked) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <VerifiedOnProvixPill
                        verified={Boolean(liveCandidate.verifiedOnProvix)}
                      />
                      {isUnlocked ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          Introduction unlocked
                        </span>
                      ) : null}
                    </div>
                  )}
                  <span className="inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brandGlow text-brand border border-brand/20">
                    {liveCandidate.experienceLevel}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRequestIntro(liveCandidate)}
                    className="mt-2.5 inline-flex items-center gap-1.5 bg-brand hover:bg-brandHover text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    Request Introduction
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-textMuted hover:text-textMain bg-background w-7 h-7 rounded-lg border border-border flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                <DrawerIcons.XMark />
              </button>
            </div>

            <div className="space-y-2 bg-background/60 px-3.5 py-2.5 rounded-xl border border-border">
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
 ? "text-brand animate-pulse"
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

            <p className="text-sm text-textMuted leading-relaxed">{lockedBio}</p>

            <div>
              <div className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-2">
                Education & Credentials
              </div>
              <div className="bg-background border border-border rounded-xl p-3.5 text-xs text-textMain space-y-2">
                <CandidateEducationSummary
                  isSelfTaught={liveCandidate.isSelfTaught}
                  university={liveCandidate.university}
                  major={liveCandidate.major}
                  gpa={liveCandidate.gpa}
                  graduationYear={liveCandidate.graduationYear}
                />
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-2">
                Core Skills
              </div>
              <div className="flex flex-wrap gap-1.5">
                {liveCandidate.skills.map((skill, sIdx) => (
                  <span
                    key={sIdx}
                    className="px-2 py-1 rounded-md text-[10px] font-bold bg-panel/80 text-textMuted border border-border/50"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-2">
                Contact & Proof Links
              </div>
              {isUnlocked ? (
                <div className="space-y-2">
                  {contactEmail && (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="w-full flex items-center justify-between bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs hover:border-brand/40 transition-all"
                    >
                      <span className="text-brand font-medium">Email</span>
                      <span className="text-textMuted break-all text-right ml-3 font-mono">
                        {contactEmail}
                      </span>
                    </a>
                  )}
                  {contactPhone && (
                    <div className="w-full flex items-center justify-between bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs">
                      <span className="text-brand font-medium">Phone</span>
                      <span className="text-textMuted font-mono">{contactPhone}</span>
                    </div>
                  )}
                  {projectLinks.length === 0 ? (
                    <p className="text-xs text-textMuted italic bg-background border border-border rounded-xl px-3.5 py-2.5">
                      No public project links provided.
                    </p>
                  ) : (
                    projectLinks.map((link) => (
                      <a
                        key={`${link.label}-${link.url}`}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-between bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs hover:border-brand/40 transition-all"
                      >
                        <span className="text-brand font-medium">
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

            <ProductionCodeAuditSection
              record={productionAuditRecordFromCandidate(liveCandidate)}
            />

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
              <div className="text-[10px] uppercase font-bold text-textMuted tracking-wider mb-2">
                Audited Proof-of-Work Breakdown
              </div>
              <ul className="space-y-2">
                {liveCandidate.projects.map((project, pIdx) => (
                  <li
                    key={pIdx}
                    className="text-xs text-textMuted leading-relaxed bg-background border border-border rounded-xl p-3.5"
                  >
                    {project}
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => onRequestIntro(liveCandidate)}
              className="w-full bg-brand hover:bg-brandHover text-white font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Request Introduction
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
