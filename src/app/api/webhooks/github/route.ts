import { handleGithubWebhook } from "@/lib/github-webhook-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleGithubWebhook(request);
}
