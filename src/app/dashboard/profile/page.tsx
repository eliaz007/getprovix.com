import { redirect } from "next/navigation";

export default function DashboardProfileRedirectPage() {
  redirect("/dashboard?tab=my_profile");
}
