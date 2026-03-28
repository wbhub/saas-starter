import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms of use for [Company Name].",
};

export default async function TermsOfUsePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <SiteHeader isLoggedIn={Boolean(session)} />
      <main className="app-content mx-auto max-w-[1440px] px-6 py-12 lg:px-10">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">Terms of Use</h1>
            <p className="text-sm app-muted">Effective date: [Month DD, YYYY]</p>
            <p className="app-muted text-sm">
              These Terms of Use (&quot;Terms&quot;) govern your access to and use of [Website URL],
              [Product Name], and related services (collectively, the &quot;Services&quot;) provided
              by [Company Legal Name] (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or
              &quot;us&quot;). By accessing or using the Services, you agree to these Terms.
            </p>
          </div>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">1. Eligibility and Accounts</h2>
            <ul className="list-disc space-y-1 pl-5 app-muted text-sm">
              <li>
                You must be at least [Minimum Age] years old and able to enter a binding agreement.
              </li>
              <li>You agree to provide accurate account information and keep it updated.</li>
              <li>
                You are responsible for safeguarding account credentials and for all activities
                under your account.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">2. Subscription, Billing, and Renewal</h2>
            <ul className="list-disc space-y-1 pl-5 app-muted text-sm">
              <li>
                Certain features require a paid subscription under the plan selected at checkout.
              </li>
              <li>
                Fees are charged in [Currency] and are due according to your billing cycle
                ([Monthly/Annual]).
              </li>
              <li>
                Subscriptions automatically renew unless canceled before the renewal date in your
                account settings.
              </li>
              <li>Taxes, if applicable, are your responsibility except for taxes on our income.</li>
              <li>
                Payment processing is handled by [Payment Processor Name], and your use of that
                processor is subject to its terms and privacy policy.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">3. Free Trials and Promotions</h2>
            <p className="app-muted text-sm">
              If offered, free trials or promotional credits are subject to the terms presented at
              sign-up, including [Trial Duration], [Eligibility Limits], and [Auto-Conversion
              Terms].
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">4. Acceptable Use</h2>
            <p className="app-muted text-sm">You agree not to:</p>
            <ul className="list-disc space-y-1 pl-5 app-muted text-sm">
              <li>Use the Services for unlawful, fraudulent, or abusive purposes.</li>
              <li>Reverse engineer, decompile, or attempt to extract source code.</li>
              <li>Interfere with or disrupt system integrity, security, or availability.</li>
              <li>
                Upload or transmit malicious code, spam, or content that infringes third-party
                rights.
              </li>
              <li>Bypass rate limits, access controls, or technical protections.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">5. Customer Data and License</h2>
            <ul className="list-disc space-y-1 pl-5 app-muted text-sm">
              <li>
                You retain all rights to data you submit to the Services (&quot;Customer
                Data&quot;).
              </li>
              <li>
                You grant us a limited license to host, process, transmit, and display Customer Data
                solely to provide and improve the Services and as otherwise permitted by our Privacy
                Policy.
              </li>
              <li>
                You represent that you have all rights necessary to provide Customer Data and that
                it does not violate applicable law or third-party rights.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">6. Intellectual Property</h2>
            <p className="app-muted text-sm">
              The Services, including software, design, text, graphics, and branding, are owned by
              the Company or its licensors and are protected by intellectual property laws. Except
              for rights expressly granted in these Terms, no rights are transferred to you.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">7. Feedback</h2>
            <p className="app-muted text-sm">
              If you provide suggestions or feedback, you grant us a worldwide, royalty-free,
              perpetual license to use it without restriction or obligation.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">8. Termination</h2>
            <p className="app-muted text-sm">
              You may stop using the Services at any time. We may suspend or terminate access if you
              violate these Terms, pose a security risk, or where needed to comply with law. Upon
              termination, sections that by nature should survive will remain in effect.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">9. Disclaimer of Warranties</h2>
            <p className="app-muted text-sm">
              To the maximum extent permitted by law, the Services are provided &quot;as is&quot;
              and &quot;as available,&quot; without warranties of any kind, whether express,
              implied, statutory, or otherwise, including implied warranties of merchantability,
              fitness for a particular purpose, non-infringement, and uninterrupted availability.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">10. Limitation of Liability</h2>
            <p className="app-muted text-sm">
              To the fullest extent permitted by law, in no event will the Company and its
              affiliates be liable for indirect, incidental, special, consequential, exemplary, or
              punitive damages, or for lost profits, revenues, data, or goodwill. Our total
              liability for claims arising from or relating to the Services will not exceed the
              amounts paid by you to us for the Services during the [12] months preceding the event
              giving rise to liability.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">11. Indemnification</h2>
            <p className="app-muted text-sm">
              You agree to defend, indemnify, and hold harmless the Company and its affiliates from
              and against claims, liabilities, damages, losses, and expenses (including reasonable
              attorneys&apos; fees) arising from your use of the Services, your Customer Data, or
              your violation of these Terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">12. Governing Law and Disputes</h2>
            <p className="app-muted text-sm">
              These Terms are governed by the laws of [State/Country], excluding its conflict-of-law
              principles. Any disputes will be resolved in the courts located in
              [Venue/Jurisdiction], unless otherwise required by applicable law.
            </p>
            <p className="app-muted text-sm">
              [Optional: Include arbitration clause, class action waiver, or informal dispute
              resolution process if desired.]
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">13. Changes to These Terms</h2>
            <p className="app-muted text-sm">
              We may update these Terms from time to time. If we make material changes, we will
              provide reasonable notice through the Services or by other means. Continued use of the
              Services after the updated Terms take effect constitutes acceptance of the revised
              Terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">14. Contact Information</h2>
            <p className="app-muted text-sm">
              [Company Legal Name]
              <br />
              [Mailing Address]
              <br />
              [Legal Contact Email]
              <br />
              [Phone Number, optional]
            </p>
          </section>

          <div className="pt-2">
            <Link href="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-300">
              Back to home
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
