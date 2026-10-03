"use client";

import TechnicalEvaluationMemo from "@/components/auditor/technical-evaluation-memo";
import { buildSampleRosterMemoProps } from "@/lib/sample-roster-dossier";

export default function SampleDossierPreview() {
  const sample = buildSampleRosterMemoProps();

  return (
    <section
      id="sample-audit-preview"
      className="mx-auto mt-16 w-full max-w-4xl scroll-mt-24"
    >
      <div className="mb-6 text-center">
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-textMuted sm:text-base">
          Interactive preview of an objective Provix technical evaluation memo.
        </p>
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-[#09090b] shadow-[0_0_0_1px_rgba(39,39,42,0.6)]">
        <TechnicalEvaluationMemo {...sample} showcase />
      </div>
    </section>
  );
}
