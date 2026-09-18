import Link from "next/link";
import { isAdminUser } from "@/lib/admin-access";
import {
  loadProfileAccountKind,
  resolvePostAuthDestination,
} from "@/lib/account-role";
import { createClient } from "@/utils/supabase/server";

const linkClassName =
  "rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-semibold text-textMain transition-colors duration-200 hover:bg-white/5";

export default async function MarketingAuthLink() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link href="/login" className={linkClassName}>
        Sign in
      </Link>
    );
  }

  const role = await loadProfileAccountKind(supabase, user.id);
  const href = resolvePostAuthDestination({
    role,
    isAdmin: isAdminUser(user),
  });

  return (
    <Link href={href} className={linkClassName}>
      Dashboard
    </Link>
  );
}
