import { Resend } from "resend";
import {
  buildJobMatchEmailHtml,
  type JobMatchEmailProps,
} from "@/components/emails/JobMatchEmail";
import { clampScore0to100 } from "@/lib/score-scale";

export type SendJobMatchNotificationInput = JobMatchEmailProps & {
  to: string;
};

export type SendJobMatchNotificationResult = {
  error: string | null;
  id?: string;
};

function normalizeStack(requiredStack: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const item of requiredStack) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(trimmed);
  }

  return tags;
}

/** Send a Resend job-match alert. Never throws — failures return `{ error }`. */
export async function sendJobMatchNotification(
  input: SendJobMatchNotificationInput
): Promise<SendJobMatchNotificationResult> {
  try {
    const to = input.to.trim();
    if (!to) {
      return { error: "A recipient email address is required." };
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    if (!resendApiKey) {
      console.warn(
        "[job-alerts] RESEND_API_KEY is not set; skipping job match email."
      );
      return {
        error:
          "Email delivery is not configured. Set RESEND_API_KEY and try again.",
      };
    }

    const props: JobMatchEmailProps = {
      developerName: input.developerName.trim() || "there",
      jobTitle: input.jobTitle.trim() || "Open role",
      companyName: input.companyName.trim() || "Hiring team",
      location: input.location.trim(),
      requiredStack: normalizeStack(input.requiredStack),
      repoName: input.repoName.trim() || "your repository",
      auditScore: clampScore0to100(input.auditScore),
      jobUrl: input.jobUrl.trim(),
    };

    if (!props.jobUrl) {
      return { error: "jobUrl is required." };
    }

    const resend = new Resend(resendApiKey);
    const { data, error } = await resend.emails.send({
      from: "Provix <notifications@getprovix.com>",
      to,
      subject: `New role match: ${props.jobTitle} at ${props.companyName}`,
      html: buildJobMatchEmailHtml(props),
    });

    if (error) {
      console.error("[job-alerts] Resend failed:", error);
      return {
        error: "Could not send the job match email. Try again shortly.",
      };
    }

    return {
      error: null,
      id: typeof data?.id === "string" ? data.id : undefined,
    };
  } catch (error) {
    console.error("[job-alerts] sendJobMatchNotification threw:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not send the job match email.",
    };
  }
}
