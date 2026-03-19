import type { NextConfig } from "next";
import path from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let supabaseOrigin = "";
if (supabaseUrl) {
  try {
    supabaseOrigin = new URL(supabaseUrl).origin;
  } catch {
    supabaseOrigin = "";
  }
}

const intercomDomains = [
  "https://widget.intercom.io",
  "https://js.intercomcdn.com",
  "https://api-iam.intercom.io",
  "https://api-ping.intercom.io",
  "https://nexus-websocket-a.intercom.io",
];

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `img-src 'self' data: https: ${intercomDomains.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' https://js.stripe.com ${intercomDomains.join(" ")}`,
  [
    "connect-src 'self'",
    supabaseOrigin,
    "https://api.stripe.com",
    "https://js.stripe.com",
    ...intercomDomains,
  ]
    .filter(Boolean)
    .join(" "),
  `frame-src 'self' https://js.stripe.com https://hooks.stripe.com ${intercomDomains.join(" ")}`,
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
