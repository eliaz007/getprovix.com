import { formatGpa } from "@/lib/gpa";
import { hasTalentEducation } from "@/lib/talent-pool-profiles";
import SelfTaughtEngineerBadge from "@/components/SelfTaughtEngineerBadge";

type CandidateEducationSummaryProps = {
  isSelfTaught?: boolean;
  university?: string | null;
  major?: string | null;
  gpa?: string | null;
  graduationYear?: string | null;
  emptyLabel?: string;
};

export default function CandidateEducationSummary({
  isSelfTaught = false,
  university,
  major,
  gpa,
  graduationYear,
  emptyLabel = "Education details not provided.",
}: CandidateEducationSummaryProps) {
  if (isSelfTaught) {
    return <SelfTaughtEngineerBadge />;
  }

  const formattedGpa = formatGpa(gpa);
  const hasDetails = hasTalentEducation({
    university: university ?? "",
    major: major ?? "",
    gpa: formattedGpa,
    graduationYear: graduationYear ?? "",
  });

  return (
    <div className="space-y-2">
      {university ? (
        <div className="flex items-start justify-between gap-3">
          <span className="text-textMuted shrink-0">University</span>
          <span className="text-right">{university}</span>
        </div>
      ) : null}
      {major ? (
        <div className="flex items-start justify-between gap-3">
          <span className="text-textMuted shrink-0">Major</span>
          <span className="text-right">{major}</span>
        </div>
      ) : null}
      {formattedGpa ? (
        <div className="flex items-start justify-between gap-3">
          <span className="text-textMuted shrink-0">GPA</span>
          <span className="text-right font-mono">{formattedGpa}</span>
        </div>
      ) : null}
      {graduationYear ? (
        <div className="flex items-start justify-between gap-3">
          <span className="text-textMuted shrink-0">Graduation</span>
          <span className="text-right">{graduationYear}</span>
        </div>
      ) : null}
      {!hasDetails ? <p className="text-textMuted">{emptyLabel}</p> : null}
    </div>
  );
}
