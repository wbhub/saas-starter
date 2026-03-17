import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
} from "lucide-react";

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
    question: "Can I change plans later?",
    answer:
      "Yes. Move between Starter, Growth, and Pro from your dashboard billing controls.",
  },
  {
    question: "How do I manage invoices and cards?",
    answer:
      "LedgerLift opens Stripe Billing Portal so customers can manage payment methods and invoices securely.",
  },
  {
    question: "Do you support user-level data access controls?",
    answer:
      "Yes. Supabase row-level security policies keep profile and billing records scoped to each user.",
  },
];

export function LandingPage({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="text-xl font-semibold tracking-tight">LedgerLift</div>
          <div className="flex items-center gap-3">
            <Link
              href={isLoggedIn ? "/dashboard" : "/login"}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
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

      <main className="mx-auto max-w-6xl px-6 py-16">
        <section className="grid gap-10 pb-20 md:grid-cols-2 md:items-center">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/40 px-3 py-1 text-sm text-indigo-200">
              <BadgeCheck className="h-4 w-4" />
              Production-ready SaaS starter
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Launch subscription SaaS faster with LedgerLift.
            </h1>
            <p className="mt-5 max-w-xl text-slate-300">
              A clean Next.js starter with Supabase auth, Stripe subscriptions,
              protected dashboard, and Vercel-friendly architecture.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={isLoggedIn ? "/dashboard" : "/signup"}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 font-medium hover:bg-indigo-400"
              >
                Build with LedgerLift
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#pricing"
                className="rounded-lg border border-white/20 px-5 py-3 font-medium hover:bg-white/10"
              >
                View Pricing
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="grid gap-4">
              {[
                "Supabase auth + Postgres with RLS",
                "Stripe Checkout, billing portal, and webhooks",
                "User dashboard with plan and subscription state",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                  <p className="text-sm text-slate-200">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 pb-20 md:grid-cols-3">
          <FeatureCard
            icon={<ShieldCheck className="h-5 w-5 text-indigo-300" />}
            title="Secure by default"
            text="RLS-backed access policies and SSR auth flow keep private data private."
          />
          <FeatureCard
            icon={<CreditCard className="h-5 w-5 text-indigo-300" />}
            title="Revenue ready"
            text="Recurring subscriptions, plan changes, and billing management are wired end-to-end."
          />
          <FeatureCard
            icon={<BarChart3 className="h-5 w-5 text-indigo-300" />}
            title="Built to iterate"
            text="Clean App Router architecture with maintainable server/client boundaries."
          />
        </section>

        <section id="pricing" className="pb-20">
          <h2 className="text-3xl font-semibold text-white">Pricing</h2>
          <p className="mt-3 text-slate-300">
            Start lean, then grow usage without changing your stack.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {pricing.map((tier) => (
              <article
                key={tier.name}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
                <p className="mt-2 text-3xl font-semibold text-indigo-300">
                  {tier.price}
                </p>
                <p className="mt-3 text-sm text-slate-300">{tier.description}</p>
                <Link
                  href={isLoggedIn ? "/dashboard" : "/signup"}
                  className="mt-6 inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
                >
                  {isLoggedIn ? "Manage Plan" : `Choose ${tier.name}`}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="pb-20">
          <h2 className="text-3xl font-semibold text-white">FAQ</h2>
          <div className="mt-8 space-y-4">
            {faqs.map((faq) => (
              <article
                key={faq.question}
                className="rounded-xl border border-white/10 bg-white/5 p-5"
              >
                <h3 className="font-medium text-white">{faq.question}</h3>
                <p className="mt-2 text-sm text-slate-300">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 px-6 py-6 text-sm text-slate-400 md:flex-row">
          <p>© {new Date().getFullYear()} LedgerLift. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="https://supabase.com" target="_blank" rel="noreferrer">
              Supabase
            </a>
            <a href="https://stripe.com" target="_blank" rel="noreferrer">
              Stripe
            </a>
            <a href="https://vercel.com" target="_blank" rel="noreferrer">
              Vercel
            </a>
          </div>
        </div>
      </footer>
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
    <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-300">{text}</p>
    </article>
  );
}
