export type RepoAccessStatusKind =
  | "unverified"
  | "private"
  | "verified"
  | "invalid_format";

export default function RepoAccessStatus({
  status,
  username,
}: {
  status: RepoAccessStatusKind | null;
  username?: string | null;
}) {
  if (!status || status === "verified") {
    return null;
  }

  if (status === "invalid_format") {
    return (
      <p
        role="alert"
        className="mt-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-amber-200"
      >
        ⚠️ Enter a specific repository name (e.g. owner/project), not just a
        username or profile.
      </p>
    );
  }

  if (status === "unverified") {
    const handle = username?.replace(/^@/, "").trim();
    return (
      <p
        role="alert"
        className="mt-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-amber-200"
      >
        {`⚠️ Not linked to @${handle || "your GitHub"}. You can only audit repos where you have authored commits.`}
      </p>
    );
  }

  return (
    <p
      role="alert"
      className="mt-1.5 rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-red-300"
    >
      🔒 Repository is private or does not exist. Ensure the URL is public.
    </p>
  );
}

export function VerifiedContributorMark({
  visible,
  className = "",
}: {
  visible: boolean;
  className?: string;
}) {
  if (!visible) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium text-emerald-400 ${className}`.trim()}
    >
      <span aria-hidden>✓</span>
      Verified Contributor
    </span>
  );
}
