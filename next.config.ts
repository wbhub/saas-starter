import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  // CSP is intentionally set in proxy.ts per-request to support nonces.
  // Do not set a static CSP header here, or it can conflict with nonce-based policy.
];

const nextConfig: NextConfig = {
  // Playwright (and some tooling) use 127.0.0.1 while browsers may show localhost — allow both
  // to fetch dev assets without cross-origin warnings. See next.config allowedDevOrigins docs.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const configuredNextConfig = sentryDsn
  ? withSentryConfig(nextConfig, {
      silent: true,
    })
  : nextConfig;

export default withNextIntl(configuredNextConfig);
