import { redirect } from "next/navigation";

/** Shortlisted → AI screen / evaluation surface. */
export default function EmployerSavedPage() {
  redirect("/dashboard?tab=evaluator");
}
