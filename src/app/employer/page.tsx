import { redirect } from "next/navigation";
import { EMPLOYER_DASHBOARD_PATH } from "@/lib/account-role";
import { createClient } from "@/utils/supabase/server";

export default async function EmployerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Talent directory is browsable by any authenticated account (employer,
  // candidate, or admin) so live pool cards can be verified locally.
  redirect(EMPLOYER_DASHBOARD_PATH);
}
