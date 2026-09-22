import { redirect } from "next/navigation";

/** Billing / Settings → company profile & account settings. */
export default function EmployerSettingsPage() {
  redirect("/dashboard?tab=my_profile");
}
