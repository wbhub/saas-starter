"use client";

import Link from "next/link";

type SiteFooterProps = {
  showTechLinks?: boolean;
};

export function SiteFooter({ showTechLinks = false }: SiteFooterProps) {
  return (
    <footer className="border-t app-border-subtle">
      <div className="app-muted mx-auto flex max-w-6xl flex-col justify-between gap-3 px-6 py-6 text-sm md:flex-row md:items-center">
        <p>
          © {new Date().getFullYear()} [Company Name]
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <Link href="/privacy-policy">Privacy Policy</Link>
          <Link href="/terms-of-use">Terms of Use</Link>
          {showTechLinks ? (
            <>
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noreferrer"
              >
                Supabase
              </a>
              <a href="https://stripe.com" target="_blank" rel="noreferrer">
                Stripe
              </a>
              <a href="https://vercel.com" target="_blank" rel="noreferrer">
                Vercel
              </a>
            </>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
