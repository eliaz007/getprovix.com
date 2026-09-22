import { redirect } from "next/navigation";

/** Hiring Pipeline → applicants board. */
export default function EmployerPipelinePage() {
  redirect("/dashboard?tab=applicants");
}
