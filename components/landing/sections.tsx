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
  Sparkles,
} from "lucide-react";
import { AuthAwareLink } from "@/components/auth-aware-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPublicPricingCatalog } from "@/lib/stripe/public-pricing";

const faqs = [
  {
    question: "What is included out of the box?",
    answer:
      "A production-oriented SaaS foundation with Supabase auth, team invites and roles, seat-based Stripe billing, dashboard routes, support email via Resend, and security middleware already wired in.",
  },
  {
    question: "Do I need to build auth and billing myself?",
    answer:
      "No. Login, signup, password reset, protected routes, checkout, plan changes, billing portal, and webhook handling are already implemented so you can focus on product features.",
  },
  {
    question: "How are teams and permissions handled?",
    answer:
      "Teams support invite flows and role-based access (`owner`, `admin`, `member`), with ownership transfer and guarded membership operations handled through API routes and database policies.",
  },
  {
    question: "Is AI chat included?",
    answer:
      "Yes. `/api/ai/chat` is included with streaming responses, CSRF checks, rate limiting, and configurable access rules by paid status or plan when `OPENAI_API_KEY` is set.",
  },
];

const stats = [
  { label: "App routes included", value: "Public + Auth + Dashboard" },
  { label: "Core workflows prewired", value: "Auth + Teams + Billing" },
  {
    label: "Security baseline included",
    value: "CSRF + CSP + rate limiting",
  },
];

const steps = [
  {
    title: "1. Clone & install",
    text: "Install dependencies, copy `.env.example` to `.env.local`, and set your required values.",
  },
  {
    title: "2. Configure providers",
    text: "Apply `supabase/schema.sql`, add Stripe price IDs + webhook secret, and configure Resend.",
  },
  {
    title: "3. Customize & launch",
    text: "Update branding, pricing, and product logic, then deploy to Vercel with optional cron jobs.",
  },
];

export function LandingHeader() {
  return (
    <header className="border-b app-border-subtle">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-400 text-white shadow-sm shadow-indigo-500/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-semibold leading-tight tracking-tight">
              SaaS Starter
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <AuthAwareLink
            loggedInHref="/dashboard"
            loggedOutHref="/login"
            loggedInLabel="Dashboard"
            loggedOutLabel="Login"
            className="rounded-lg border app-border-subtle px-4 py-2 text-sm hover:bg-[color:var(--surface-subtle)]"
          />
          <AuthAwareLink
            loggedInHref="/dashboard"
            loggedOutHref="/signup"
            loggedInLabel="Open App"
            loggedOutLabel="Start Free"
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          />
        </div>
      </nav>
    </header>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-3xl border app-border-subtle app-surface px-6 py-10 md:px-10 md:py-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_45%)]" />
      <div className="relative grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-500/5 px-3 py-1 text-sm app-accent">
            <Clock3 className="h-4 w-4" />
            Production-grade SaaS foundation
          </p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Launch a production-ready SaaS in days, not months.
          </h1>
          <p className="app-muted mt-5 max-w-xl text-base">
            Skip months of platform work. Auth, team access, seat-based billing, support
            email, and AI-ready APIs are already wired so you can focus on the product
            customers pay for.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <AuthAwareLink
              loggedInHref="/dashboard"
              loggedOutHref="/signup"
              loggedInLabel="Go to dashboard"
              loggedOutLabel="Start free now"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 font-medium text-white hover:bg-indigo-400"
            >
              <ArrowRight className="h-4 w-4" />
            </AuthAwareLink>
            <Link
              href="#pricing"
              className="rounded-lg border app-border-subtle px-5 py-3 font-medium hover:bg-[color:var(--surface-subtle)]"
            >
              View pricing
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm app-muted">
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              Supabase auth flows
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              Team invites and roles
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              Seat-based Stripe billing
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              AI chat endpoint
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              Resend support email
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              CSRF + CSP + rate limits
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border app-border-subtle app-surface-subtle p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">What you ship immediately</h2>
              <p className="app-muted mt-1 text-sm">
                App and API flows mapped to a real SaaS launch.
              </p>
            </div>
            <div className="grid gap-4">
              {[
                "Signup, login, forgot-password, reset-password, and protected dashboard routes",
                "Team onboarding with invites, acceptance, role management, and ownership transfer",
                "Seat-based Stripe checkout, billing portal, plan changes, and webhook syncing",
                "Support request API with Resend delivery and authenticated sender context",
                "Optional AI chat route with streaming responses, budgeting, and plan-aware access",
                "Security defaults including CSRF checks, CSP headers, request IDs, and rate limiting",
              ].map((item) => (
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
  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold md:text-3xl">How to get up-and-running</h2>
          <p className="app-muted mt-2 max-w-2xl">
            Follow the setup in the README to go from fresh clone to a working SaaS app
            with real auth and billing flows.
          </p>
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
  return (
    <section className="rounded-3xl border app-border-subtle app-surface px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] app-muted">
          Why this starter
        </p>
        <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
          Built for real SaaS operations, not just demos.
        </h2>
        <p className="app-muted mt-3">
          The codebase includes production-minded patterns for teams, subscriptions,
          support, AI access controls, and operational cron endpoints.
        </p>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="inline-flex items-center gap-2 rounded-full border app-border-subtle bg-[color:var(--surface-subtle)] px-4 py-2 text-xs md:text-sm"
          >
            <span className="font-medium text-indigo-600 dark:text-indigo-300">
              {stat.value}
            </span>
            <span className="app-muted">· {stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BestPracticesSection() {
  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-semibold">Built-in best practices</h2>
          <p className="app-muted mt-2 max-w-2xl">
            Core paths are implemented with safety and maintainability in mind, so you
            can extend confidently.
          </p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <FeatureCard
          icon={<ShieldCheck className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />}
          title="Security defaults"
          text="CSRF protection, CSP, strict API headers, and request-aware middleware are included."
        />
        <FeatureCard
          icon={<CreditCard className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />}
          title="Team-based billing"
          text="Stripe subscriptions are team-scoped with seat reconciliation, portal access, and plan changes."
        />
        <FeatureCard
          icon={<BarChart3 className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />}
          title="Operational endpoints"
          text="Cron routes reconcile seats and clean webhook data, with token-based authorization."
        />
      </div>
    </section>
  );
}

export function StackSection() {
  return (
    <section className="space-y-6 rounded-3xl border app-border-subtle app-surface px-6 py-8 md:px-8 md:py-9">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold md:text-3xl">Inside the stack</h2>
          <p className="app-muted mt-2 max-w-2xl">
            Next.js App Router with clear boundaries across UI routes, API handlers, and
            shared platform libraries.
          </p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <article className="rounded-2xl border app-border-subtle app-surface-subtle p-5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
            Auth & user flows
          </p>
          <p className="app-muted mt-2">
            Supabase SSR auth helpers, invite acceptance flow, team context, and account
            settings are already connected.
          </p>
        </article>
        <article className="rounded-2xl border app-border-subtle app-surface-subtle p-5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
            Billing & Stripe
          </p>
          <p className="app-muted mt-2">
            Checkout, portal, and change-plan APIs are backed by webhook dedupe and
            subscription sync logic.
          </p>
        </article>
        <article className="rounded-2xl border app-border-subtle app-surface-subtle p-5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
            AI, support, and observability
          </p>
          <p className="app-muted mt-2">
            AI chat, Resend support email, and optional Intercom + Sentry integrations
            are ready to configure.
          </p>
        </article>
      </div>
    </section>
  );
}

export async function PricingSection() {
  const pricingCatalog = await getPublicPricingCatalog();

  return (
    <section id="pricing" className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold">Seat-based pricing from Stripe</h2>
        <p className="app-muted mt-3">
          Configure Starter, Growth, and Pro price IDs once, and the landing page and
          billing flows stay in sync.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {pricingCatalog.map((tier, idx) => (
          <article
            key={tier.name}
            className={`rounded-2xl border app-surface p-6 ${
              idx === 1
                ? "border-indigo-400/70 shadow-lg shadow-indigo-500/10"
                : "app-border-subtle"
            }`}
          >
            <p
              aria-hidden={idx !== 1}
              className={`mb-3 inline-flex items-center rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-300 ${
                idx === 1 ? "" : "invisible"
              }`}
            >
              Most popular
            </p>
            <h3 className="text-lg font-semibold">{tier.name}</h3>
            <p className="mt-2 text-3xl font-semibold text-indigo-600 dark:text-indigo-300">
              {tier.priceLabel}
            </p>
            <p className="app-muted mt-3 text-sm">{tier.description}</p>
            <AuthAwareLink
              loggedInHref="/dashboard"
              loggedOutHref="/signup"
              loggedInLabel="Manage Plan"
              loggedOutLabel={`Choose ${tier.name}`}
              className="mt-6 inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            />
          </article>
        ))}
      </div>
    </section>
  );
}

export function CtaFaqSection() {
  return (
    <section className="space-y-10">
      <div className="rounded-3xl border app-border-subtle bg-indigo-500/[0.08] p-8 md:p-10">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center">
          <div>
            <h2 className="text-3xl font-semibold">Ready to ship your SaaS faster?</h2>
            <p className="app-muted mt-3 max-w-2xl">
              Start with proven auth, team, billing, and API infrastructure, then build
              the product experience that makes your business unique.
            </p>
          </div>
          <div className="flex flex-wrap justify-start gap-3 md:justify-end">
            <AuthAwareLink
              loggedInHref="/dashboard"
              loggedOutHref="/signup"
              loggedInLabel="Open dashboard"
              loggedOutLabel="Create your account"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 font-medium text-white hover:bg-indigo-400"
            >
              <ArrowRight className="h-4 w-4" />
            </AuthAwareLink>
            <Link
              href="#pricing"
              className="rounded-lg border app-border-subtle px-5 py-3 font-medium hover:bg-[color:var(--surface-subtle)]"
            >
              Compare plans
            </Link>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-3xl font-semibold">FAQ</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <article key={faq.question} className="rounded-xl border app-border-subtle app-surface p-5">
              <h3 className="font-medium">{faq.question}</h3>
              <p className="app-muted mt-2 text-sm">{faq.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="app-surface-subtle rounded-2xl border app-border-subtle p-6">
      <div className="mb-3">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="app-muted mt-2 text-sm">{text}</p>
    </article>
  );
}
