import Link from "next/link";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Privacy Policy",
  "How Provix collects, uses, and protects data when you connect GitHub, scan repositories, and open fix pull requests.",
  "/privacy"
);

type PrivacySection = {
  title: string;
  paragraphs?: string[];
  bullets?: Array<{ label?: string; text: string }>;
};

const sections: PrivacySection[] = [
  {
    title: "Information we collect",
    paragraphs: [
      "When you create an account, Provix stores the sign-in details needed to identify you, such as your email address and the account record created by our authentication provider.",
      "When you install the Provix GitHub App, we store the installation and the repository names you connected so we can tell which repos your account may scan.",
      "When you run a scan or open a fix pull request, we read repository files from GitHub for that request. A personal access token you paste is used for that request. We also store records of fix pull requests we open, such as the repository, file path, and pull request reference.",
      "We collect ordinary product logs, such as pages you open, errors, and browser type, so we can run and debug the service.",
    ],
  },
  {
    title: "How we use information",
    paragraphs: [
      "We use this information to sign you in, scan repositories you are allowed to access, show findings, and open fix pull requests you request.",
      "We do not sell personal information, and we do not publish your repository contents as a public profile or talent listing.",
      "We may use aggregated, de-identified usage data to understand which parts of the product fail and to improve scans and fixes.",
    ],
  },
  {
    title: "GitHub access",
    bullets: [
      {
        label: "GitHub App:",
        text: "If you install the App, GitHub gives Provix a short-lived installation token for repositories you selected. We use it to read those repositories and to open pull requests when you ask.",
      },
      {
        label: "Personal token:",
        text: "If you supply a personal access token, Provix uses it only to read or write the repository for that request. Do not send a token for an account or repository you do not control.",
      },
    ],
  },
  {
    title: "Processors",
    paragraphs: [
      "Supabase stores accounts and the GitHub installation records tied to your user.",
      "Vercel hosts the application.",
      "GitHub receives API calls to list files, read content, and open pull requests on repositories you connect.",
      "Those providers process data to deliver their services and have their own privacy terms.",
    ],
  },
  {
    title: "Security and retention",
    paragraphs: [
      "Traffic to Provix uses HTTPS. Account passwords are handled by the authentication provider; the application does not keep raw passwords.",
      "We keep account and installation records while your account is active, and pull-request records so the workspace can show what was opened. You can ask us to delete your account data, except where we need to keep a record for security, fraud, or legal reasons.",
    ],
  },
  {
    title: "Your requests",
    paragraphs: [
      "You may ask to access, correct, or delete personal information we hold about you.",
      "Email support@getprovix.com. We will respond within a reasonable time.",
      "If we change this policy, we will update the date on this page.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-textMuted">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-brand hover:text-brand transition-colors"
        >
          ← Back to Home
        </Link>

        <header className="mt-8 mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand mb-3">
            Legal
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-textMain">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-textMuted leading-relaxed">
            Effective date: November 4, 2026. This policy describes how Provix
            collects, uses, and protects information when you sign in, connect a
            GitHub repository, run a scan, or open a fix pull request.
          </p>
        </header>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-textMain mb-3">
                {section.title}
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-textMuted">
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul className="list-disc space-y-2 pl-5 marker:text-zinc-600">
                    {section.bullets.map((bullet) => (
                      <li key={`${bullet.label ?? ""}${bullet.text}`}>
                        {bullet.label ? (
                          <span className="font-semibold text-textMain">
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

        <footer className="mt-12 border-t border-border pt-8 text-sm text-textMuted print:hidden">
          Questions? Email{" "}
          <a
            href="mailto:support@getprovix.com"
            className="text-brand hover:text-brand transition-colors"
          >
            support@getprovix.com
          </a>
          .
        </footer>
      </div>
    </div>
  );
}
