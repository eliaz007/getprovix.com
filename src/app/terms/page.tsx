import Link from "next/link";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Terms of Service",
  "Terms for using Provix, an automated code security, static analysis, and self-healing software platform, including GitHub repository scanning and automated fix pull requests.",
  "/terms"
);

type TermsSection = {
  title: string;
  intro?: string;
  paragraphs?: string[];
  bullets?: Array<{ label?: string; text: string }>;
  bulletsLead?: string;
};

const sections: TermsSection[] = [
  {
    title: "1. The service",
    intro:
      "Provix is an automated code security, static analysis, and self-healing software platform for GitHub repositories. After you sign in, you connect a repository with the Provix GitHub App or a token that can read it. Provix scans source files, reports findings, and can open a fix pull request for issues it knows how to patch.",
    bullets: [
      {
        label: "Scans:",
        text: "A scan reads repository contents through GitHub and checks them for secrets, client-side database queries, known dependency floors, and oversized modules. A scan may cover only part of a repository, including a cap on the largest source files.",
      },
      {
        label: "Fix pull requests:",
        text: "When you choose Fix with PR, Provix generates the patch, may fall back to a bounded AI retry loop for complex shapes, verifies the result against tsc --noEmit, and opens a pull request on that repository. You review and merge it. Provix does not merge pull requests for you.",
      },
      {
        label: "What Provix is not:",
        text: "Provix is an automated code security, static analysis, and self-healing software platform. It is not a hiring marketplace, recruiter, employer, or a guarantee that a repository is secure, complete, or production-ready.",
      },
    ],
  },
  {
    title: "2. Your repositories",
    bullets: [
      {
        label: "Authority:",
        text: "You may connect only repositories you own or are allowed to scan and open pull requests on. You are responsible for the GitHub permissions you grant.",
      },
      {
        label: "Permission to scan:",
        text: "By connecting a repository, you grant Provix a limited license to read its contents, run static checks, and, when you request it, propose changes by opening a pull request. That license is only for operating the service.",
      },
      {
        label: "Your code:",
        text: "You keep ownership of your code. Provix does not claim ownership of your repository or of patches you merge. We do not use your private repositories to train public foundation models.",
      },
    ],
  },
  {
    title: "3. Automated results",
    bullets: [
      {
        label: "Point in time:",
        text: "Findings, scores, and suggested patches are automated and describe the files that were scanned. They are not a full security audit, a penetration test, or a certification.",
      },
      {
        label: "You decide:",
        text: "A fix pull request can be wrong, incomplete, or unsuitable for your codebase. You are responsible for reviewing it before you merge.",
      },
      {
        label: '"As is":',
        text: 'The service is provided "AS IS" and "AS AVAILABLE." We do not warrant that every issue will be found or that every opened pull request will typecheck, build, or be safe to merge.',
      },
    ],
  },
  {
    title: "4. Acceptable use",
    bulletsLead: "You agree not to:",
    bullets: [
      {
        text: "Scan or open pull requests on repositories you are not allowed to access.",
      },
      {
        text: "Upload or connect malware, or use Provix to attack systems or people.",
      },
      {
        text: "Interfere with the service, probe it for other customers' data, or bypass sign-in and repository checks.",
      },
      {
        text: "Misrepresent your identity or your right to a GitHub repository.",
      },
    ],
  },
  {
    title: "5. Accounts",
    paragraphs: [
      "Scans and fix pull requests require a signed-in account. You are responsible for activity under your account and for keeping your sign-in credentials private. A personal access token you submit is used for that request and is not a license for Provix to act on repositories you do not control.",
    ],
  },
  {
    title: "6. Suspension",
    paragraphs: [
      "We may suspend or terminate an account, or refuse a scan or pull request, if use violates these Terms or puts the service or other people at risk.",
    ],
  },
  {
    title: "7. Limitation of liability",
    paragraphs: [
      "To the maximum extent permitted by law, Provix and its operators are not liable for indirect, incidental, special, consequential, or punitive damages, including lost profits, lost data, or damage from merging a pull request, arising from your use of the service or from findings the scan did not report.",
    ],
  },
  {
    title: "8. Changes",
    paragraphs: [
      'We may update these Terms. The "Last updated" date at the top of this page will change when we do. Continuing to use Provix after that date means you accept the updated Terms.',
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-400">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-brand transition-colors hover:text-brand"
        >
          ← Back to Home
        </Link>

        <header className="mb-10 mt-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand">
            Legal
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-100 sm:text-4xl">
            Terms of Service
          </h1>
          <div className="mt-4 space-y-1 text-sm leading-relaxed text-zinc-400">
            <p>
              <span className="font-semibold text-zinc-300">Last Updated:</span>{" "}
              November 4, 2026
            </p>
            <p>
              <span className="font-semibold text-zinc-300">Effective Date:</span>{" "}
              November 4, 2026
            </p>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-zinc-400">
            These Terms of Service (&quot;Terms&quot;) govern use of Provix
            (&quot;Provix,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
            at getprovix.com. The service scans GitHub repositories and can open
            fix pull requests. By creating an account, connecting a repository, or
            using a scan or fix, you agree to these Terms.
          </p>
        </header>

        <div className="space-y-10">
          {sections.map((section) => (
            <section
              key={section.title}
              className="border-t border-zinc-800/80 pt-8 first:border-t-0 first:pt-0"
            >
              <h2 className="mb-3 text-xl font-bold text-zinc-100">
                {section.title}
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-zinc-400">
                {section.intro ? <p>{section.intro}</p> : null}
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bulletsLead ? <p>{section.bulletsLead}</p> : null}
                {section.bullets ? (
                  <ul className="list-disc space-y-2 pl-5 marker:text-zinc-600">
                    {section.bullets.map((bullet) => (
                      <li key={`${bullet.label ?? ""}${bullet.text}`}>
                        {bullet.label ? (
                          <span className="font-semibold text-zinc-300">
                            {bullet.label}{" "}
                          </span>
                        ) : null}
                        {bullet.text}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 border-t border-zinc-800 pt-8 text-sm text-zinc-400 print:hidden">
          Questions? Email{" "}
          <a
            href="mailto:support@getprovix.com"
            className="text-brand transition-colors hover:text-brand"
          >
            support@getprovix.com
          </a>
          .
        </footer>
      </div>
    </div>
  );
}
