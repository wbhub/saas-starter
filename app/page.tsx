import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/landing-page";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return <LandingPage isLoggedIn={Boolean(session)} />;
}
