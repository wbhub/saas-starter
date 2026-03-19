import { SiteFooter } from "./site-footer";
import {
  BestPracticesSection,
  CtaFaqSection,
  GettingStartedSection,
  HeroSection,
  LandingHeader,
  PricingSection,
  StackSection,
  WhyStarterSection,
} from "./landing/sections";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <LandingHeader />

      <main className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        <div className="space-y-16 md:space-y-20">
          <HeroSection />
          <GettingStartedSection />
          <WhyStarterSection />
          <BestPracticesSection />
          <StackSection />
          <PricingSection />
          <CtaFaqSection />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
