import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
let metadataBase = new URL("http://localhost:3000");
try {
  metadataBase = new URL(appUrl);
} catch {
  metadataBase = new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase,
  title: "SaaS Starter | Next.js, Supabase, Stripe",
  description:
    "Generic, production-ready SaaS starter with Next.js, Supabase auth, and Stripe subscriptions.",
  openGraph: {
    title: "SaaS Starter | Next.js, Supabase, Stripe",
    description:
      "Generic, production-ready SaaS starter with Next.js, Supabase auth, and Stripe subscriptions.",
    type: "website",
    url: "/",
    images: [
      {
        url: "/globe.svg",
        alt: "SaaS Starter preview image",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SaaS Starter | Next.js, Supabase, Stripe",
    description:
      "Generic, production-ready SaaS starter with Next.js, Supabase auth, and Stripe subscriptions.",
    images: ["/globe.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
