import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/dashboard");

  return (
    <main className="auth">
      <div className="auth-card">
        <span className="logo">
          <span className="logo-mark">
            <LogoMark />
          </span>
          Tailr
        </span>
        <div className="stack">
          <h1>Your bets, your record, your numbers.</h1>
          <p className="muted">
            Add the bets you place, settle them when they finish, and see profit, ROI and win rate worked out the same way every time. Results are
            what you report; Tailr does not connect to your bookmaker.
          </p>
        </div>
        <div className="stack">
          <Link href="/sign-up" className="btn btn-primary btn-block">
            Create account
          </Link>
          <Link href="/sign-in" className="btn btn-block">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
