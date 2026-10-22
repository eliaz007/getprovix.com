import { redirect } from "next/navigation";

type SignupSearchParams = Record<string, string | string[] | undefined>;

function buildLoginQuery(searchParams: SignupSearchParams): string {
  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      qs.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        qs.append(key, item);
      }
    }
  }

  // Force the shared auth page into sign-up mode when no role was provided.
  if (!qs.has("mode") && !qs.has("role")) {
    qs.set("mode", "sign-up");
  } else if (!qs.has("mode")) {
    qs.set("mode", "sign-up");
  }

  return qs.toString();
}

/**
 * Marketplace entry for role-based account creation.
 * `/signup?role=developer` and `/signup?role=founder` land on the shared
 * login UI in sign-up mode with the role pre-selected.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<SignupSearchParams>;
}) {
  const params = await searchParams;
  const query = buildLoginQuery(params);
  redirect(query ? `/login?${query}` : "/login?mode=sign-up");
}
