import Link from "next/link";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Terms of Service",
  "Terms governing use of Provix, including repository benchmarking, candidate dossiers, and contract marketplace retainers.",
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
    title: "1. Platform & Marketplace Structure",
    intro:
      "Provix operates an automated developer qualification platform and two-way talent marketplace connecting software engineers with founders and engineering leaders.",
    bullets: [
      {
        label: "For Candidates:",
        text: "We analyze submitted software repositories against production standards (architecture, tests, CI/CD, and error handling) to determine qualification for our verified talent roster.",
      },
      {
        label: "For Hiring Teams:",
        text: "We provide access to verified candidate dossiers, benchmark telemetry, and introduction channels.",
      },
      {
        label: "Platform Role:",
        text: "Provix is a venue for introductions. Provix is not an employer, recruiter of record, or contracting party to any eventual employment or consulting relationship formed between users. We make no representations or guarantees regarding candidate hiring, placement, or technical performance.",
      },
    ],
  },
  {
    title: "2. Repository Ingestion & Intellectual Property",
    bullets: [
      {
        label: "Permission to Analyze:",
        text: "By connecting or submitting a repository (via GitHub or other git providers), you grant Provix a limited, non-exclusive license to clone, parse abstract syntax trees (ASTs), analyze dependencies, evaluate test coverage, and execute automated static scans on your code strictly to generate your benchmark score and dossier.",
      },
      {
        label: "Your Code Ownership:",
        text: "You retain full and exclusive ownership of all code, intellectual property, and proprietary repository contents. Provix does not claim any ownership rights over your software, and we do not use your private codebases to train public foundation models.",
      },
      {
        label: "Dossiers & Telemetry:",
        text: "If your repository meets qualification thresholds, your resulting readiness score, architectural breakdown, and non-sensitive repository metadata will be compiled into a candidate dossier visible to prospective hiring teams on the network.",
      },
    ],
  },
  {
    title: "3. Automated Benchmarking Disclaimers",
    bullets: [
      {
        label: "Automated Nature:",
        text: "Verification scores, readiness metrics, and architectural breakdowns are generated through automated algorithmic checks. They represent static point-in-time signals and do not constitute an exhaustive security audit, legal compliance certification, or human technical warranty.",
      },
      {
        label: '"As Is" Basis:',
        text: 'All benchmarks, scores, and platform recommendations are provided strictly on an "AS IS" and "AS AVAILABLE" basis. Hiring organizations are solely responsible for conducting their own technical due diligence before entering into any employment or contractual relationship.',
      },
    ],
  },
  {
    title: "4. Acceptable Use",
    bulletsLead: "You agree not to:",
    bullets: [
      {
        text: "Submit codebases containing malicious payloads, viruses, ransomware, or intentionally obfuscated vulnerabilities.",
      },
      {
        text: "Attempt to exploit, reverse-engineer, manipulate, or artificially inflate Provix benchmark scores.",
      },
      {
        text: "Scrape, harvest, or bulk-export candidate dossiers, engineering contacts, or platform data without prior written consent.",
      },
      {
        text: "Misrepresent your identity, repository ownership, or technical contributions.",
      },
    ],
  },
  {
    title: "5. Contract Work & Marketplace Terms",
    intro:
      "The following terms govern Contract Engagements & Retainers arranged through the Provix talent marketplace.",
    bullets: [
      {
        label: "Nature of Engagements:",
        text: "Clients engage talent on a weekly capped retainer basis (e.g., 10, 20, or 30+ hours per week). Weekly fees cover reserved developer capacity for that scheduled calendar week and are billed in advance. Unused hours do not roll over, accumulate, or entitle the Client to refunds, provided the Contractor was ready and available to perform services.",
      },
      {
        label: "Independent Contractor Classification:",
        text: "All developers and contractors offering services through Provix are independent contractors and not employees, partners, or agents of Provix or the Client. Contractors remain solely responsible for reporting and paying all applicable local, state, federal, and international self-employment and income taxes. Provix acts solely as an introductory vetting platform and billing conduit.",
      },
      {
        label: "Intellectual Property Assignment:",
        text: 'Upon receipt of full payment for the applicable engagement period, all code, documentation, architectures, and intellectual work product generated by the Contractor during the engagement transfer fully, irrevocably, and exclusively to the Client as "work made for hire." Provix claims zero ownership over Client codebase, data, or Contractor work product.',
      },
      {
        label: "Non-Circumvention (Platform Exclusivity):",
        text: "Clients and Contractors introduced or matched through Provix agree not to negotiate, solicit, contract, or complete freelance, consulting, or employment agreements directly or indirectly off-platform for a period of twelve (12) months following the initial introduction. Any direct engagement without Provix’s written consent is subject to standard placement and platform buyout fees.",
      },
    ],
  },
  {
    title: "6. Termination & Suspension",
    paragraphs: [
      "We reserve the right to suspend or terminate accounts, remove repositories, or revoke verified roster status at any time if conduct violates these Terms or compromises platform security and integrity.",
    ],
  },
  {
    title: "7. Limitation of Liability",
    paragraphs: [
      "To the maximum extent permitted by applicable law, Provix, its founders, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, employment opportunities, or business goodwill arising from your use of or inability to access the Services.",
    ],
  },
  {
    title: "8. Modifications",
    paragraphs: [
      'We may update these Terms periodically. Any modifications take effect upon updating the "Last Updated" date at the top of this document. Continued use of the Services signifies acceptance of the revised Terms.',
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
              October 8, 2026
            </p>
            <p>
              <span className="font-semibold text-zinc-300">Effective Date:</span>{" "}
              October 6, 2026
            </p>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-zinc-400">
            Welcome to Provix (&quot;Provix,&quot; &quot;we,&quot; &quot;us,&quot;
            or &quot;our&quot;), accessible at getprovix.com and associated
            domains. By accessing or using our platform, automated repository
            benchmarks, candidate dossiers, and talent network (collectively, the
            &quot;Services&quot;), you agree to be bound by these Terms of Service
            (&quot;Terms&quot;).
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
