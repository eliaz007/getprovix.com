import Link from "next/link";
import { isAdminUser } from "@/lib/admin-access";
import {
  loadProfileAccountKind,
  resolvePostAuthDestination,
} from "@/lib/account-role";
import { AUTH_SESSION_TIMEOUT_MS } from "@/lib/auth-session-timeout";
import { createClient } from "@/utils/supabase/server";

export const linkClassName =
  "rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-semibold text-textMain transition-colors duration-200 hover:bg-white/5";

function SignInLink() {
  return (
    <Link href="/login" className={linkClassName}>
      Sign in
    </Link>
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error("Marketing auth timed out"));
    }, ms);

    promise.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function resolveMarketingHref(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const role = await loadProfileAccountKind(supabase, user.id);
  return resolvePostAuthDestination({
    role,
    isAdmin: isAdminUser(user),
  });
}

export default async function MarketingAuthLink() {
  let href: string | null = null;

  try {
    href = await withTimeout(resolveMarketingHref(), AUTH_SESSION_TIMEOUT_MS);
  } catch (error) {
    console.error("[marketing-auth-link] auth lookup failed:", error);
    href = null;
  }

  if (!href) {
    return <SignInLink />;
  }

  return (
    <Link href={href} className={linkClassName}>
      Dashboard
    </Link>
  );
}
