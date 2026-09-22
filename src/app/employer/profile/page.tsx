import { redirect } from "next/navigation";

/** Company Profile. */
export default function EmployerProfilePage() {
  redirect("/dashboard?tab=my_profile");
}
