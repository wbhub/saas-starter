import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { IntercomProvider } from "@/components/intercom-provider";
import { createClient } from "@/lib/supabase/server";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SaaS Starter | Next.js, Supabase, Stripe",
  description:
    "Generic, production-ready SaaS starter with Next.js, Supabase auth, and Stripe subscriptions.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userName =
    typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;

  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <IntercomProvider
            appId={process.env.NEXT_PUBLIC_INTERCOM_APP_ID}
            user={
              user
                ? {
                    id: user.id,
                    email: user.email ?? null,
                    name: userName,
                    createdAt: user.created_at,
                  }
                : null
            }
          />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
