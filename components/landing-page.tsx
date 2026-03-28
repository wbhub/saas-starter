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

export function LandingPage({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="app-content min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <SiteHeader isLoggedIn={isLoggedIn} />

      <main className="mx-auto max-w-[1440px] px-6 py-14 md:py-20 lg:px-10">
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
