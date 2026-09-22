import { redirect } from "next/navigation";

/** Candidates / Search → existing talent pool console. */
export default function EmployerTalentPage() {
  redirect("/dashboard?tab=talent");
}
