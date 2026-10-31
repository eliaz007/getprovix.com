import type { Metadata } from "next";
import OnboardingFlow from "@/components/onboarding/onboarding-flow";

export const metadata: Metadata = {
  title: "Onboarding",
  description:
    "Sign in with GitHub, install the Provix App, pick a TypeScript repository, and run your first AST audit.",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
