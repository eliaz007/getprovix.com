import Link from "next/link";

export default function TalentNetworkCta() {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-gradient-to-b from-panel/80 to-panel p-6 shadow-xl backdrop-blur-sm sm:p-8">
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
          Provix Talent Network
        </span>
        <h3 className="mt-4 text-2xl font-bold tracking-tight text-textMain sm:text-3xl">
          Turn your code quality into direct founder introductions.
        </h3>
        <p className="mt-2 text-sm text-textMuted sm:text-base">
          This audit is an unverified playground report. Create a verified
          builder profile to lock in your score and skip standard resume
          screenings.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="flex items-start gap-2 text-xs text-textMain/90">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-brand"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>
              <strong>Verified Badge:</strong> Cryptographically prove you wrote
              the code
            </span>
          </div>
          <div className="flex items-start gap-2 text-xs text-textMain/90">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-brand"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>
              <strong>Direct Intros:</strong> Founders contact you based on
              architecture, not resumes
            </span>
          </div>
          <div className="flex items-start gap-2 text-xs text-textMain/90">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-brand"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>
              <strong>Zero Spam:</strong> Inbound requests only from companies
              ready to hire
            </span>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/20 transition-all hover:scale-[1.01] hover:bg-brandHover active:scale-[0.99]"
          >
            Sign in with GitHub to Claim Verified Profile
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </Link>
          <span className="text-xs text-textMuted">
            Takes 10 seconds • No credit card required
          </span>
        </div>
      </div>
    </div>
  );
}
