import { redirect } from "next/navigation";

/** Retired public resume/auditor surface (also redirected in next.config). */
export default function PublicAuditsPage() {
  redirect("/");
}
