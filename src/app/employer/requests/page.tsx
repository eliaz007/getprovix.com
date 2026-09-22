import { redirect } from "next/navigation";

/** Outbound Requests → applicants / interest queue. */
export default function EmployerRequestsPage() {
  redirect("/dashboard?tab=applicants");
}
