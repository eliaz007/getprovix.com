function normalizeGitHubHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

export function isValidGitHubUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) {
    return false;
  }

  if (/github\.com/i.test(trimmed)) {
    const candidate = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

    try {
      const url = new URL(candidate);
      return normalizeGitHubHost(url.hostname) === "github.com";
    } catch {
      return true;
    }
  }

  return false;
}

export function getGitHubUrlValidationMessage(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return "GitHub profile URL is required";
  }

  return isValidGitHubUrl(trimmed)
    ? null
    : "Enter a valid GitHub URL (e.g. https://github.com/your-handle)";
}

export function normalizeGitHubUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}
