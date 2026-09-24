import ComparisonShowcase from "@/components/ComparisonShowcase";
import LandingAudienceCards from "@/components/landing/landing-audience-cards";
import LandingAuditPanel from "@/components/landing/landing-audit-panel";

export default function LandingHome() {
  return (
    <LandingAuditPanel>
      <ComparisonShowcase />
      <LandingAudienceCards />
    </LandingAuditPanel>
  );
}
