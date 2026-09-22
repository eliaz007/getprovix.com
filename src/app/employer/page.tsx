import { redirect } from "next/navigation";

/** Employer console home → Candidates / Search. */
export default function EmployerIndexPage() {
  redirect("/employer/talent");
}
