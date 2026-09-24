import { Lock } from "lucide-react";
import { GITHUB_REPOS_LOCK_MESSAGE } from "@/lib/alias-generator";

type LockedGitHubReposBadgeProps = {
  className?: string;
};

export default function LockedGitHubReposBadge({
  className = "",
}: LockedGitHubReposBadgeProps) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border border-border bg-background px-3.5 py-3 text-xs text-textMuted ${className}`}
    >
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-textMuted" aria-hidden />
      <span>{GITHUB_REPOS_LOCK_MESSAGE}</span>
    </div>
  );
}
