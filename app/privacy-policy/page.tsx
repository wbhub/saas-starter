import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for [Company Name].",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="app-content min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <SiteHeader />
      <main className="mx-auto max-w-[1440px] px-6 py-12 lg:px-10">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
            <p className="text-sm app-muted">Last updated: [Month DD, YYYY]</p>
            <p className="app-muted text-sm">
              This Privacy Policy explains how [Company Name] (&quot;Company,&quot; &quot;we,&quot;
              &quot;our,&quot; or &quot;us&quot;) collects, uses, discloses, and safeguards personal
              information when you use [Website URL], [Product Name], and related services
              (collectively, the &quot;Services&quot;).
            </p>
          </div>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">1. Scope</h2>
            <p className="app-muted text-sm">
              This policy applies to information we collect online through the Services and in
              connection with customer, prospect, and support interactions. It does not apply to
              third-party websites, services, or applications that we do not own or control.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">2. Information We Collect</h2>
            <ul className="list-disc space-y-1 pl-5 app-muted text-sm">
              <li>
                <strong>Account and profile data:</strong> [Name], [Email Address], [Company],
                [Billing Address], [Other Account Data].
              </li>
              <li>
                <strong>Payment and transaction data:</strong> [Payment Processor Name] processes
                payment information; we receive limited details such as [Last 4 digits], [Card
                Brand], [Subscription Status], and [Transaction IDs].
              </li>
              <li>
                <strong>Usage and device data:</strong> [IP Address], [Browser Type], [Device
                Identifiers], [Pages/Features Used], [Date/Time Stamps], [Referring URLs],
                [Crash/Diagnostic Data].
              </li>
              <li>
                <strong>Communications:</strong> Information you provide when contacting support,
                participating in surveys, or communicating with us (including via [Support Tool
                Name]).
              </li>
              <li>
                <strong>Cookies and similar technologies:</strong> We use [Cookies], [Pixels], and
                [Local Storage] for authentication, security, preferences, analytics, and product
                improvements.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">3. How We Use Information</h2>
            <ul className="list-disc space-y-1 pl-5 app-muted text-sm">
              <li>Provide, operate, maintain, and improve the Services.</li>
              <li>Create and manage user accounts and subscriptions.</li>
              <li>Process payments, invoices, renewals, and account notifications.</li>
              <li>Deliver customer support and respond to inquiries.</li>
              <li>Detect, prevent, and investigate fraud, abuse, and security incidents.</li>
              <li>
                Comply with legal obligations and enforce our terms, policies, and contractual
                rights.
              </li>
              <li>
                Send service-related communications and, where permitted, marketing communications
                from which you can opt out.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">4. Legal Bases (EEA/UK)</h2>
            <p className="app-muted text-sm">
              If applicable, we process personal data under the following legal bases: [Performance
              of Contract], [Legitimate Interests], [Consent], and [Compliance with Legal
              Obligations]. You may contact us for details about the balancing tests we rely on for
              legitimate interests.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">5. How We Share Information</h2>
            <ul className="list-disc space-y-1 pl-5 app-muted text-sm">
              <li>
                <strong>Service providers:</strong> We share information with vendors that support
                our operations, such as [Hosting Provider], [Analytics Provider], [Payment
                Processor], [Customer Support Platform], and [Email Provider].
              </li>
              <li>
                <strong>Business transfers:</strong> In connection with a merger, acquisition,
                financing, reorganization, bankruptcy, or sale of assets.
              </li>
              <li>
                <strong>Legal and safety disclosures:</strong> When required to comply with
                applicable law, legal process, or valid governmental request.
              </li>
              <li>
                <strong>With your direction:</strong> When you authorize integrations or otherwise
                instruct us to share data.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">6. International Data Transfers</h2>
            <p className="app-muted text-sm">
              We may process information in [Country/Countries]. Where required, we use appropriate
              safeguards for cross-border transfers, such as [Standard Contractual Clauses] and
              equivalent measures.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">7. Data Retention</h2>
            <p className="app-muted text-sm">
              We retain personal information for as long as necessary to provide the Services, meet
              legal and accounting obligations, resolve disputes, and enforce agreements. Typical
              retention periods: [X months/years for account data], [X months/years for logs], [X
              years for billing records].
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">8. Security</h2>
            <p className="app-muted text-sm">
              We use reasonable administrative, technical, and physical safeguards to protect
              personal information, including [Encryption in Transit], [Encryption at Rest], [Access
              Controls], and [Monitoring]. No method of transmission or storage is 100% secure.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">9. Your Privacy Rights</h2>
            <p className="app-muted text-sm">
              Depending on your location, you may have rights to access, correct, delete, or port
              your personal data; object to or restrict processing; and withdraw consent. To
              exercise these rights, contact us at [Privacy Contact Email]. We may need to verify
              your identity before completing a request.
            </p>
            <p className="app-muted text-sm">
              Residents of [Applicable U.S. States, e.g., California, Virginia, Colorado] may have
              additional rights under state law, including rights related to sensitive data and
              targeted advertising.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">10. Children&apos;s Privacy</h2>
            <p className="app-muted text-sm">
              The Services are not directed to children under [Age Threshold, e.g., 13/16], and we
              do not knowingly collect personal information from children. If you believe a child
              has provided personal information, contact us at [Privacy Contact Email].
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">11. Third-Party Services</h2>
            <p className="app-muted text-sm">
              The Services may contain links to or integrations with third-party services. Their
              privacy practices are governed by their own policies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">12. Changes to This Policy</h2>
            <p className="app-muted text-sm">
              We may update this Privacy Policy from time to time. If we make material changes, we
              will provide notice through the Services or by other appropriate means and update the
              &quot;Last updated&quot; date above.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">13. Contact Us</h2>
            <p className="app-muted text-sm">
              [Company Legal Name]
              <br />
              [Mailing Address]
              <br />
              [Privacy Contact Email]
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
