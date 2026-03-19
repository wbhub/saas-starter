import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { IntercomProvider } from "@/components/intercom-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SaaS Starter | Next.js, Supabase, Stripe",
  description:
    "Generic, production-ready SaaS starter with Next.js, Supabase auth, and Stripe subscriptions.",
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
          <Suspense fallback={null}>
            <IntercomProvider appId={process.env.NEXT_PUBLIC_INTERCOM_APP_ID} />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
