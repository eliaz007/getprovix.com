import { Lock } from "lucide-react";
import { CONTACT_DOSSIER_LOCK_MESSAGE } from "@/lib/alias-generator";

type LockedContactDossierBadgeProps = {
  className?: string;
};

export default function LockedContactDossierBadge({
  className = "",
}: LockedContactDossierBadgeProps) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border border-border bg-background px-3.5 py-3 text-xs text-textMuted ${className}`}
    >
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-textMuted" aria-hidden />
      <span>{CONTACT_DOSSIER_LOCK_MESSAGE}</span>
    </div>
  );
}
