import {
  getStandardEmailValidationMessage,
  isStandardEmail,
  normalizeEmail,
} from "@/lib/validate-email";

/** Consumer inboxes that cannot verify an employer as a company. */
export const FREE_WEBMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
] as const;

const FREE_WEBMAIL_DOMAIN_SET = new Set<string>(FREE_WEBMAIL_DOMAINS);

export const CORPORATE_WORK_EMAIL_MESSAGE =
  "Use a corporate work email. Personal inboxes (Gmail, Yahoo, Hotmail, Outlook, and iCloud) are not accepted.";

export function extractEmailDomain(email: string): string | null {
  const normalized = normalizeEmail(email).toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) {
    return null;
  }

  const domain = normalized.slice(at + 1).replace(/\.+$/, "");
  if (!domain || !domain.includes(".")) {
    return null;
  }

  return domain;
}

export function isFreeWebmailDomain(domain: string | null | undefined): boolean {
  if (!domain) {
    return false;
  }

  return FREE_WEBMAIL_DOMAIN_SET.has(domain.trim().toLowerCase());
}

export function isCorporateWorkEmail(email: string | null | undefined): boolean {
  if (!email || !isStandardEmail(email)) {
    return false;
  }

  const domain = extractEmailDomain(email);
  if (!domain) {
    return false;
  }

  return !isFreeWebmailDomain(domain);
}

export function getCorporateWorkEmailValidationMessage(
  email: string
): string | null {
  const basic = getStandardEmailValidationMessage(email);
  if (basic) {
    return basic;
  }

  if (!isCorporateWorkEmail(email)) {
    return CORPORATE_WORK_EMAIL_MESSAGE;
  }

  return null;
}
