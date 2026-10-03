import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-access";
import { createClient } from "@/utils/supabase/server";

/**
 * Server-side admin barrier for every /admin/* console route.
 * Middleware also enforces this; the layout is a second hard gate.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (!isAdminUser(user)) {
    redirect("/");
  }

  return children;
}
