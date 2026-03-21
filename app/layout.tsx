import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
