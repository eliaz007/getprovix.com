import { redirect } from "next/navigation";
import EmployerJobPostings from "@/components/employer/employer-job-postings";
import {
  CANDIDATE_DASHBOARD_PATH,
  normalizeAccountKind,
} from "@/lib/account-role";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployerJobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  let role = normalizeAccountKind(
    typeof profile?.role === "string" ? profile.role : null
  );

  if (!role) {
    const { data: linked } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    role = normalizeAccountKind(
      typeof linked?.role === "string" ? linked.role : null
    );
  }

  if (role !== "employer") {
    redirect(CANDIDATE_DASHBOARD_PATH);
  }

  return <EmployerJobPostings />;
}
