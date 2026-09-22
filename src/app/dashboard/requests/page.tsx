import { redirect } from "next/navigation";

export default function DashboardRequestsRedirectPage() {
  redirect("/dashboard?tab=intro_requests");
}
