import { redirect } from "next/navigation";

/** Outbound outreach alias. */
export default function EmployerOutreachPage() {
  redirect("/dashboard?tab=applicants");
}
