import { SITE_LOGO_URL, SITE_NAME } from "@/lib/site";

export type JobMatchEmailProps = {
  developerName: string;
  jobTitle: string;
  companyName: string;
  location: string;
  requiredStack: string[];
  repoName: string;
  auditScore: number;
  jobUrl: string;
};

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(score)));
}

function stackTags(requiredStack: string[]): string {
  if (requiredStack.length === 0) {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:600;">Generalist</span>`;
  }

  return requiredStack
    .map(
      (tag) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:600;">${escapeHtml(tag)}</span>`
    )
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline-HTML builder used by Resend (no @react-email dependency required). */
export function buildJobMatchEmailHtml(props: JobMatchEmailProps): string {
  const score = clampScore(props.auditScore);
  const name = escapeHtml(props.developerName.trim() || "there");
  const jobTitle = escapeHtml(props.jobTitle);
  const companyName = escapeHtml(props.companyName);
  const location = escapeHtml(props.location.trim() || "Remote / flexible");
  const repoName = escapeHtml(props.repoName);
  const jobUrl = escapeHtml(props.jobUrl);
  const logoUrl = escapeHtml(SITE_LOGO_URL);

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
      <div style="margin: 0 0 20px;">
        <img src="${logoUrl}" alt="${SITE_NAME}" width="120" height="32" style="display:block;height:32px;width:auto;border:0;" />
        <p style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #4f46e5; font-weight: 700; margin: 12px 0 0;">
          ${SITE_NAME} Job Match
        </p>
      </div>

      <h1 style="font-size: 24px; line-height: 1.3; margin: 0 0 12px; color: #111827;">
        New role match matching your stack
      </h1>
      <p style="margin: 0 0 20px; color: #4b5563;">
        Hi ${name}, a hiring team posted a role that lines up with the technologies in your audited work.
      </p>

      <div style="border: 1px solid #e5e7eb; border-radius: 14px; background: #f9fafb; padding: 18px 18px 12px; margin: 0 0 20px;">
        <p style="margin: 0 0 4px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; font-weight: 700;">
          Role match
        </p>
        <h2 style="margin: 0 0 8px; font-size: 20px; color: #111827;">${jobTitle}</h2>
        <p style="margin: 0 0 4px; font-weight: 600; color: #374151;">${companyName}</p>
        <p style="margin: 0 0 14px; color: #6b7280; font-size: 14px;">${location}</p>
        <div>${stackTags(props.requiredStack)}</div>
      </div>

      <p style="margin: 0 0 24px; color: #374151;">
        Why you're seeing this: Your audited repo (<strong>${repoName}</strong>) matches the core technologies this team uses.
      </p>

      <p style="margin: 0 0 28px;">
        <a href="${jobUrl}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 700; padding: 12px 22px; border-radius: 12px;">
          View Role &amp; Apply
        </a>
      </p>

      <div style="border-left: 3px solid #4f46e5; padding: 12px 0 12px 14px; background: #eef2ff; border-radius: 0 12px 12px 0;">
        <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #4338ca; font-weight: 700;">
          Score / Pro Tip
        </p>
        <p style="margin: 0; color: #374151; font-size: 14px;">
          Tip for visibility: Hiring leads review verified profiles first. Your current audit score is <strong>${score}/100</strong>. Update your repo or resolve open flags anytime to push your application to the top of their queue.
        </p>
      </div>

      <p style="margin: 28px 0 0; font-size: 12px; color: #9ca3af;">
        You’re receiving this because job-match alerts are enabled on your ${SITE_NAME} profile.
      </p>
    </div>
  `.trim();
}

/**
 * React email template for job-match alerts.
 * Renders the same content as {@link buildJobMatchEmailHtml} for App Router previews.
 */
export default function JobMatchEmail(props: JobMatchEmailProps) {
  const score = clampScore(props.auditScore);
  const name = props.developerName.trim() || "there";
  const location = props.location.trim() || "Remote / flexible";
  const tags =
    props.requiredStack.length > 0 ? props.requiredStack : ["Generalist"];

  return (
    <div
      style={{
        fontFamily: "Arial, Helvetica, sans-serif",
        lineHeight: 1.6,
        color: "#111827",
        maxWidth: 640,
        margin: "0 auto",
        padding: 24,
        background: "#ffffff",
      }}
    >
      <div style={{ margin: "0 0 20px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={SITE_LOGO_URL}
          alt={SITE_NAME}
          width={120}
          height={32}
          style={{ display: "block", height: 32, width: "auto", border: 0 }}
        />
        <p
          style={{
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#4f46e5",
            fontWeight: 700,
            margin: "12px 0 0",
          }}
        >
          {SITE_NAME} Job Match
        </p>
      </div>

      <h1
        style={{
          fontSize: 24,
          lineHeight: 1.3,
          margin: "0 0 12px",
          color: "#111827",
        }}
      >
        New role match matching your stack
      </h1>
      <p style={{ margin: "0 0 20px", color: "#4b5563" }}>
        Hi {name}, a hiring team posted a role that lines up with the
        technologies in your audited work.
      </p>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          background: "#f9fafb",
          padding: "18px 18px 12px",
          margin: "0 0 20px",
        }}
      >
        <p
          style={{
            margin: "0 0 4px",
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#6b7280",
            fontWeight: 700,
          }}
        >
          Role match
        </p>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "#111827" }}>
          {props.jobTitle}
        </h2>
        <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#374151" }}>
          {props.companyName}
        </p>
        <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 14 }}>
          {location}
        </p>
        <div>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: "inline-block",
                margin: "0 6px 6px 0",
                padding: "4px 10px",
                borderRadius: 999,
                background: "#eef2ff",
                color: "#4338ca",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <p style={{ margin: "0 0 24px", color: "#374151" }}>
        Why you&apos;re seeing this: Your audited repo (
        <strong>{props.repoName}</strong>) matches the core technologies this
        team uses.
      </p>

      <p style={{ margin: "0 0 28px" }}>
        <a
          href={props.jobUrl}
          style={{
            display: "inline-block",
            background: "#4f46e5",
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: 700,
            padding: "12px 22px",
            borderRadius: 12,
          }}
        >
          View Role &amp; Apply
        </a>
      </p>

      <div
        style={{
          borderLeft: "3px solid #4f46e5",
          padding: "12px 0 12px 14px",
          background: "#eef2ff",
          borderRadius: "0 12px 12px 0",
        }}
      >
        <p
          style={{
            margin: "0 0 6px",
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#4338ca",
            fontWeight: 700,
          }}
        >
          Score / Pro Tip
        </p>
        <p style={{ margin: 0, color: "#374151", fontSize: 14 }}>
          Tip for visibility: Hiring leads review verified profiles first. Your
          current audit score is <strong>{score}/100</strong>. Update your repo
          or resolve open flags anytime to push your application to the top of
          their queue.
        </p>
      </div>

      <p style={{ margin: "28px 0 0", fontSize: 12, color: "#9ca3af" }}>
        You&apos;re receiving this because job-match alerts are enabled on your{" "}
        {SITE_NAME} profile.
      </p>
    </div>
  );
}
