import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Choose your account type",
  "Select Candidate or Employer to finish setting up your Provix account.",
  "/onboarding/role"
);

export default function RoleOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
