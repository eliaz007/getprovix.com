const YOUTUBE_VIDEO_ID_PATTERN = /^[\w-]{11}$/;

function normalizeYouTubeHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").replace(/^m\./i, "").toLowerCase();
}

function extractYouTubeVideoId(url: URL): string | null {
  const host = normalizeYouTubeHost(url.hostname);

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const queryId = url.searchParams.get("v");
    if (queryId && YOUTUBE_VIDEO_ID_PATTERN.test(queryId)) {
      return queryId;
    }

    const pathMatch = url.pathname.match(
      /^\/(?:shorts|embed|live|v)\/([\w-]{11})/
    );
    if (pathMatch?.[1]) {
      return pathMatch[1];
    }
  }

  return null;
}

export function isValidYouTubeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) {
    return true;
  }

  const candidate = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

  try {
    return extractYouTubeVideoId(new URL(candidate)) !== null;
  } catch {
    return false;
  }
}

export function getYouTubeUrlValidationMessage(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  return isValidYouTubeUrl(trimmed) ? null : "Please enter a valid YouTube link";
}
