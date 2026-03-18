"use client";

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

import { SiteFooter } from "./site-footer";
import { ThemeToggle } from "./theme-toggle";

const pricing = [
  {
    name: "Starter",
    price: "$25/mo",
    description: "Perfect for founders validating a new product.",
  },
  {
    name: "Growth",
    price: "$50/mo",
    description: "For teams scaling activation and retention.",
  },
  {
    name: "Pro",
    price: "$100/mo",
    description: "For businesses that need reliability at scale.",
  },
];

const faqs = [
  {
    question: "What do I get out of the box?",
    answer:
      "You get a fully wired SaaS skeleton: Supabase auth, protected routes, a user dashboard, Stripe subscriptions and billing portal, Intercom chat integration, and basic profile + billing data models.",
  },
  {
    question: "How much work is left for me?",
    answer:
      "Most infrastructure is done. You focus on product-specific features, domain models, and UI copy while keeping the existing auth, billing, and routing patterns.",
  },
  {
    question: "Can I change pricing and plans easily?",
    answer:
      "Yes. You can adjust plan names, prices, and Stripe product IDs in one place, and the checkout + billing portal flows will continue to work.",
  },
  {
    question: "Is this starter production-ready?",
    answer:
      "It’s designed as a strong foundation: secure auth with RLS, Stripe webhooks, and an App Router architecture that you can run in production after you’ve added your product logic and testing.",
  },
];

const stats = [
  { label: "Time to first payment flow", value: "< 15 minutes" },
  { label: "Core SaaS workflows prewired", value: "Auth + Billing + DB" },
  { label: "Infra designed for scale", value: "Next.js + Supabase + Stripe + Intercom" },
];

const steps = [
  {
    title: "1. Clone & install",
    text: "Clone the repo, install dependencies, and add your environment variables.",
  },
  {
    title: "2. Connect Your Stack",
    text: "Drop in your Supabase, Stripe, and Intercom keys and run the provided setup commands.",
  },
  {
    title: "3. Customize & launch",
    text: "Adjust plans, copy, and branding, then deploy to Vercel when you’re ready.",
  },
];

export function LandingPage({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
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
            <Link
              href={isLoggedIn ? "/dashboard" : "/login"}
              className="rounded-lg border app-border-subtle px-4 py-2 text-sm hover:bg-[color:var(--surface-subtle)]"
            >
              {isLoggedIn ? "Dashboard" : "Login"}
            </Link>
            <Link
              href={isLoggedIn ? "/dashboard" : "/signup"}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              {isLoggedIn ? "Open App" : "Start Free"}
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        <div className="space-y-16 md:space-y-20">
          <section className="relative overflow-hidden rounded-3xl border app-border-subtle app-surface px-6 py-10 md:px-10 md:py-14">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_45%)]" />
            <div className="relative grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center">
              <div>
                <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-500/5 px-3 py-1 text-sm app-accent">
                  <Clock3 className="h-4 w-4" />
                  Build in days, not months
                </p>
                <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                  Turn your SaaS idea into a production-ready app.
                </h1>
                <p className="app-muted mt-5 max-w-xl text-base">
                  Stop rebuilding auth, billing, and support infrastructure from
                  scratch. This starter gives you a polished foundation with
                  integrated Intercom so you can focus on features customers
                  actually pay for.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href={isLoggedIn ? "/dashboard" : "/signup"}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 font-medium text-white hover:bg-indigo-400"
                  >
                    {isLoggedIn ? "Go to dashboard" : "Start free now"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="#pricing"
                    className="rounded-lg border app-border-subtle px-5 py-3 font-medium hover:bg-[color:var(--surface-subtle)]"
                  >
                    Explore plans
                  </Link>
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-4 text-sm app-muted">
                  <span className="inline-flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                    Secure auth flows
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                    Stripe subscriptions
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                    Scalable database policies
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                    Protected dashboard
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                    Billing portal
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                    Intercom chat widget
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border app-border-subtle app-surface-subtle p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold">What you ship immediately</h2>
                    <p className="app-muted mt-1 text-sm">
                      Ready-to-use app flows users expect from day one.
                    </p>
                  </div>
                  <div className="grid gap-4">
                    {[
                      "Account creation, login, and protected routes",
                      "Stripe Checkout + billing portal + webhook lifecycle",
                      "Intercom widget with user identity bootstrapping for in-app support",
                      "Role-safe, user-scoped data access with Supabase RLS",
                      "App Router structure designed for long-term maintainability",
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

          <section className="space-y-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold md:text-3xl">
                  How to get up-and-running
                </h2>
                <p className="app-muted mt-2 max-w-2xl">
                  Go from idea to a running subscription product with three concrete steps,
                  without getting stuck wiring up infrastructure.
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

          <section className="rounded-3xl border app-border-subtle app-surface px-6 py-8 md:px-10 md:py-10">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] app-muted">
                Why this starter
              </p>
              <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
                Ship a complete SaaS foundation from day one.
              </h2>
              <p className="app-muted mt-3">
                Auth, billing, and user data flows are already integrated so you can
                focus on product decisions instead of stitching together infrastructure.
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

          <section className="space-y-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-3xl font-semibold">Built-in best practices</h2>
                <p className="app-muted mt-2 max-w-2xl">
                  The architecture, auth patterns, and billing flows are chosen to
                  match how modern SaaS products actually operate in production.
                </p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <FeatureCard
                icon={<ShieldCheck className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />}
                title="Secure by default"
                text="RLS-backed access policies and SSR auth flow keep private data private."
              />
              <FeatureCard
                icon={<CreditCard className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />}
                title="Revenue ready"
                text="Recurring subscriptions, plan changes, and billing management are wired end-to-end."
              />
              <FeatureCard
                icon={<BarChart3 className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />}
                title="Support built in"
                text="Intercom is already wired so users can reach your team from day one."
              />
            </div>
          </section>

          <section className="space-y-6 rounded-3xl border app-border-subtle app-surface px-6 py-8 md:px-8 md:py-9">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold md:text-3xl">Inside the stack</h2>
                <p className="app-muted mt-2 max-w-2xl">
                  A predictable layout that makes it obvious where to plug in new
                  features, without hunting across frameworks or folders.
                </p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <article className="rounded-2xl border app-border-subtle app-surface-subtle p-5 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
                  Auth & user flows
                </p>
                <p className="app-muted mt-2">
                  Supabase auth client + server helpers, protected routes, and session
                  handling wired for the App Router.
                </p>
              </article>
              <article className="rounded-2xl border app-border-subtle app-surface-subtle p-5 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
                  Billing & Stripe
                </p>
                <p className="app-muted mt-2">
                  Stripe Checkout and Billing Portal routes, webhook handlers, and plan
                  metadata hooked into the dashboard state.
                </p>
              </article>
              <article className="rounded-2xl border app-border-subtle app-surface-subtle p-5 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] app-muted">
                  Support & Intercom
                </p>
                <p className="app-muted mt-2">
                  Optional Intercom setup loads globally and boots with signed-in
                  user context so conversations are tied to the right account.
                </p>
              </article>
            </div>
          </section>

          <section id="pricing" className="space-y-8">
            <div>
              <h2 className="text-3xl font-semibold">Simple pricing for each stage</h2>
              <p className="app-muted mt-3">
                Update your pricing tiers, prices, and plan rules to match your business
                as it grows.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {pricing.map((tier, idx) => (
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
                    {tier.price}
                  </p>
                  <p className="app-muted mt-3 text-sm">{tier.description}</p>
                  <Link
                    href={isLoggedIn ? "/dashboard" : "/signup"}
                    className="mt-6 inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
                  >
                    {isLoggedIn ? "Manage Plan" : `Choose ${tier.name}`}
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-10">
            <div className="rounded-3xl border app-border-subtle bg-indigo-500/[0.08] p-8 md:p-10">
              <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center">
                <div>
                  <h2 className="text-3xl font-semibold">
                    Ready to ship your SaaS faster?
                  </h2>
                  <p className="app-muted mt-3 max-w-2xl">
                    Use this starter as your launchpad and spend your time on the
                    features that make your product unique.
                  </p>
                </div>
                <div className="flex flex-wrap justify-start gap-3 md:justify-end">
                  <Link
                    href={isLoggedIn ? "/dashboard" : "/signup"}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 font-medium text-white hover:bg-indigo-400"
                  >
                    {isLoggedIn ? "Open dashboard" : "Create your account"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
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
        </div>
      </main>

      <SiteFooter showTechLinks />
    </div>
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
