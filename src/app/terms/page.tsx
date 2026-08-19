import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Provix",
  description:
    "Terms governing use of the Provix candidate auditing and matchmaking platform.",
};

const sections = [
  {
    title: "Acceptance of Terms",
    paragraphs: [
      "By accessing or using Provix, creating an account, or clicking to accept these Terms of Service, you agree to be bound by this agreement and our Privacy Policy. If you do not agree, do not use the platform.",
      "If you use Provix on behalf of a company or other legal entity, you represent that you have authority to bind that entity to these terms, and \"you\" refers to that entity.",
      "We may update these terms from time to time. Continued use of Provix after changes become effective constitutes acceptance of the revised terms.",
    ],
  },
  {
    title: "Description of Service",
    paragraphs: [
      "Provix is a candidate auditing and matchmaking platform that helps employers evaluate proof-of-work signals and helps candidates discover relevant opportunities.",
      "The service includes automated repository and profile screening, integrity and match scoring, talent pool discovery, interview enablement features, and AI-assisted analysis delivered through the Provix dashboard and related APIs.",
      "Provix provides informational and workflow tools to support hiring decisions. We do not guarantee employment outcomes, candidate availability, or the accuracy of third-party data sources.",
    ],
  },
  {
    title: "User Accounts & Conduct",
    paragraphs: [
      "You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.",
      "You agree to provide accurate, current, and complete profile information and to update it as needed. You must not impersonate another person or misrepresent your qualifications, experience, or affiliations.",
      "Candidates must submit authentic repository, portfolio, and proof-of-work materials. You may not upload fraudulent data, manipulate audit signals, scrape the platform in unauthorized ways, or attempt to circumvent access controls, billing, or visibility settings.",
      "Employers agree to use candidate information lawfully and only for legitimate recruiting, evaluation, and hiring purposes permitted by applicable law and the candidate's visibility settings.",
    ],
  },
  {
    title: "Intellectual Property & Content Ownership",
    paragraphs: [
      "Provix and its licensors own all rights in the platform, including software, branding, design, documentation, and proprietary scoring methodologies, except for content you or other users provide.",
      "You retain ownership of content you submit, including profile details, repository links, bios, and portfolio materials. By using Provix, you grant us a limited, non-exclusive license to host, process, display, and analyze that content solely to operate and improve the service.",
      "Feedback you provide may be used by Provix without restriction or compensation. You may not copy, reverse engineer, or resell the platform or its outputs except as expressly permitted in writing.",
    ],
  },
  {
    title: "Limitation of Liability & Disclaimers",
    paragraphs: [
      "Provix is provided on an \"as is\" and \"as available\" basis. To the fullest extent permitted by law, we disclaim all warranties, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement.",
      "AI-generated scores, summaries, interview prompts, and match results are assistive outputs and should not be treated as definitive hiring decisions. You remain responsible for independent verification and compliance with your internal policies and applicable law.",
      "To the maximum extent permitted by law, Provix and its affiliates will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for lost profits, data, goodwill, or business interruption arising from your use of the service.",
      "Our total liability for any claim relating to the service will not exceed the greater of (a) the amount you paid Provix in the twelve months before the event giving rise to the claim, or (b) one hundred U.S. dollars (USD $100), except where such limitation is prohibited by law.",
    ],
  },
  {
    title: "Termination of Service",
    paragraphs: [
      "You may stop using Provix at any time. You may also request account closure by contacting support, subject to data retention requirements described in our Privacy Policy.",
      "We may suspend or terminate your access immediately if you violate these terms, create security or legal risk, or use the platform in a fraudulent or abusive manner.",
      "Upon termination, your right to use Provix ends. Provisions that by their nature should survive termination — including intellectual property, disclaimers, limitations of liability, and dispute-related terms — will remain in effect.",
    ],
  },
  {
    title: "Contact Info",
    paragraphs: [
      "Questions about these Terms of Service may be sent to support@provix.app.",
      "We aim to respond to legal and account inquiries within a reasonable timeframe.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          ← Back to Home
        </Link>

        <header className="mt-8 mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-3">
            Legal
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Terms of Service
          </h1>
          <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
            Effective date: August 16, 2026. These terms govern your access to
            and use of the Provix candidate auditing and matchmaking platform.
          </p>
        </header>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-white mb-3">
                {section.title}
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 pt-8 border-t border-zinc-800 text-sm text-zinc-500">
          Questions? Email{" "}
          <a
            href="mailto:support@getprovix.com"
            className="text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            support@provix.app
          </a>
          .
        </footer>
      </div>
    </div>
  );
}
