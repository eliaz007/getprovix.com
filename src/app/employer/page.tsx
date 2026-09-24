import { redirect } from "next/navigation";
import {
  EMPLOYER_DASHBOARD_PATH,
  loadStoredAccountRole,
  normalizeAccountKind,
} from "@/lib/account-role";
import { createClient } from "@/utils/supabase/server";

export default async function EmployerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const role = await loadStoredAccountRole(supabase, user);
  if (normalizeAccountKind(role) !== "employer") {
    redirect("/dashboard");
  }

  redirect(EMPLOYER_DASHBOARD_PATH);
}
