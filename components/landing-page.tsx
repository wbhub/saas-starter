import { PublicShell } from "./layout-shells";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import {
  BestPracticesSection,
  CtaFaqSection,
  GettingStartedSection,
  HeroSection,
  PricingSection,
  StackSection,
  WhyStarterSection,
} from "./landing/sections";

export function LandingPage() {
  return (
    <div className="app-content min-h-screen bg-background text-foreground">
      <SiteHeader />

      <PublicShell as="main" className="py-14 md:py-20">
        <div className="space-y-16 md:space-y-20">
          <HeroSection />
          <GettingStartedSection />
          <WhyStarterSection />
          <BestPracticesSection />
          <StackSection />
          <PricingSection />
          <CtaFaqSection />
        </div>
      </PublicShell>

      <SiteFooter />
    </div>
  );
}
