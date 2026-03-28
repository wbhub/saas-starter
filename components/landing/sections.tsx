import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  Clock3,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthAwareLink } from "@/components/auth-aware-link";
import { LandingPricingCards } from "@/components/landing/pricing-toggle";
import { getPublicPricingCatalog } from "@/lib/stripe/public-pricing";
import { hasAnnualPricing } from "@/lib/stripe/config";

export function HeroSection() {
  const t = useTranslations("Landing.hero");
  const shipItems = [
    t("shipItem1"),
    t("shipItem2"),
    t("shipItem3"),
    t("shipItem4"),
    t("shipItem5"),
    t("shipItem6"),
  ];

  return (
    <section className="relative overflow-hidden rounded-3xl border app-border-subtle app-surface px-6 py-10 md:px-10 md:py-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_45%)]" />
      <div className="relative grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/60 bg-indigo-500/10 px-3 py-1 text-sm text-indigo-600 dark:text-indigo-400">
            <Clock3 className="h-4 w-4" />
            {t("badge")}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{t("title")}</h1>
          <p className="app-muted mt-5 max-w-xl text-base">{t("description")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <AuthAwareLink
              loggedInHref="/dashboard"
              loggedOutHref="/signup"
              loggedInLabel={t("goDashboard")}
              loggedOutLabel={t("startFreeNow")}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 font-medium text-white hover:bg-indigo-400"
            >
              <ArrowRight className="h-4 w-4" />
            </AuthAwareLink>
            <Link
              href="#pricing"
              className="rounded-lg border app-border-subtle px-5 py-3 font-medium hover:bg-[color:var(--surface-subtle)]"
            >
              {t("viewPricing")}
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm app-muted">
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              {t("feature1")}
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              {t("feature2")}
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              {t("feature3")}
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              {t("feature4")}
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              {t("feature5")}
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              {t("feature6")}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border app-border-subtle app-surface-subtle p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{t("shipNowTitle")}</h2>
              <p className="app-muted mt-1 text-sm">{t("shipNowDescription")}</p>
            </div>
            <div className="grid gap-4">
              {shipItems.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    <CheckCircle2
                      size={20}
                      className="text-emerald-500 dark:text-emerald-300"
                      aria-hidden="true"
                    />
                  </span>
                  <p className="app-muted text-sm">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function GettingStartedSection() {
  const t = useTranslations("Landing.gettingStarted");
  const steps = [
    { title: t("step1Title"), text: t("step1Text") },
    { title: t("step2Title"), text: t("step2Text") },
    { title: t("step3Title"), text: t("step3Text") },
  ];

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold md:text-3xl">{t("title")}</h2>
          <p className="app-muted mt-2 max-w-2xl">{t("description")}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <article
            key={step.title}
            className="rounded-2xl border app-border-subtle app-surface p-5"
          >
            <h3 className="text-sm font-semibold uppercase tracking-wide app-muted">
              {step.title}
            </h3>
            <p className="mt-2 text-sm app-muted">{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function WhyStarterSection() {
  const t = useTranslations("Landing.whyStarter");
  const stats = [
    { label: t("stat1Label"), value: t("stat1Value") },
    { label: t("stat2Label"), value: t("stat2Value") },
    { label: t("stat3Label"), value: t("stat3Value") },
  ];

  return (
    <section className="rounded-3xl border app-border-subtle app-surface px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] app-muted">{t("label")}</p>
        <h2 className="mt-3 text-2xl font-semibold md:text-3xl">{t("title")}</h2>
        <p className="app-muted mt-3">{t("description")}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="inline-flex items-center gap-2 rounded-full border app-border-subtle bg-[color:var(--surface-subtle)] px-4 py-2 text-xs md:text-sm"
          >
            <span className="font-medium text-indigo-600 dark:text-indigo-300">{stat.value}</span>
            <span className="app-muted">· {stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BestPracticesSection() {
  const t = useTranslations("Landing.bestPractices");

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-semibold">{t("title")}</h2>
          <p className="app-muted mt-2 max-w-2xl">{t("description")}</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <FeatureCard
          icon={<ShieldCheck className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />}
          title={t("securityDefaultsTitle")}
          text={t("securityDefaultsText")}
        />
        <FeatureCard
          icon={<CreditCard className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />}
          title={t("teamBillingTitle")}
          text={t("teamBillingText")}
        />
        <FeatureCard
          icon={<BarChart3 className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />}
          title={t("operationalTitle")}
          text={t("operationalText")}
        />
      </div>
    </section>
  );
}

export function StackSection() {
  const t = useTranslations("Landing.stack");

  return (
    <section className="space-y-6 rounded-3xl border app-border-subtle app-surface px-6 py-8 md:px-8 md:py-9">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold md:text-3xl">{t("title")}</h2>
          <p className="app-muted mt-2 max-w-2xl">{t("description")}</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <article className="rounded-2xl border app-border-subtle app-surface-subtle p-5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
            {t("authTitle")}
          </p>
          <p className="app-muted mt-2">{t("authText")}</p>
        </article>
        <article className="rounded-2xl border app-border-subtle app-surface-subtle p-5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
            {t("billingTitle")}
          </p>
          <p className="app-muted mt-2">{t("billingText")}</p>
        </article>
        <article className="rounded-2xl border app-border-subtle app-surface-subtle p-5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
            {t("opsTitle")}
          </p>
          <p className="app-muted mt-2">{t("opsText")}</p>
        </article>
      </div>
    </section>
  );
}

export async function PricingSection() {
  const t = await getTranslations("Landing.pricing");
  const pricingCatalog = await getPublicPricingCatalog();

  return (
    <section id="pricing" className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold">{t("title")}</h2>
        <p className="app-muted mt-3">{t("description")}</p>
      </div>
      <LandingPricingCards
        plans={pricingCatalog}
        showAnnualToggle={hasAnnualPricing}
      />
    </section>
  );
}

export function CtaFaqSection() {
  const t = useTranslations("Landing.ctaFaq");
  const faqs = [
    { question: t("q1"), answer: t("a1") },
    { question: t("q2"), answer: t("a2") },
    { question: t("q3"), answer: t("a3") },
    { question: t("q4"), answer: t("a4") },
  ];

  return (
    <section className="space-y-10">
      <div className="rounded-3xl border app-border-subtle bg-indigo-500/[0.08] p-8 md:p-10">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center">
          <div>
            <h2 className="text-3xl font-semibold">{t("title")}</h2>
            <p className="app-muted mt-3 max-w-2xl">{t("description")}</p>
          </div>
          <div className="flex flex-wrap justify-start gap-3 md:justify-end">
            <AuthAwareLink
              loggedInHref="/dashboard"
              loggedOutHref="/signup"
              loggedInLabel={t("openDashboard")}
              loggedOutLabel={t("createAccount")}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 font-medium text-white hover:bg-indigo-400"
            >
              <ArrowRight className="h-4 w-4" />
            </AuthAwareLink>
            <Link
              href="#pricing"
              className="rounded-lg border app-border-subtle px-5 py-3 font-medium hover:bg-[color:var(--surface-subtle)]"
            >
              {t("comparePlans")}
            </Link>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-3xl font-semibold">{t("faqTitle")}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <article
              key={faq.question}
              className="rounded-xl border app-border-subtle app-surface p-5"
            >
              <h3 className="font-medium">{faq.question}</h3>
              <p className="app-muted mt-2 text-sm">{faq.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="app-surface-subtle rounded-2xl border app-border-subtle p-6">
      <div className="mb-3">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="app-muted mt-2 text-sm">{text}</p>
    </article>
  );
}
