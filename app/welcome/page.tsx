import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/icons";
import { InstallPrompt } from "@/components/install-prompt";
import { createClient } from "@/lib/supabase/server";
import { WelcomeName } from "./welcome-name";

export const metadata = { title: "Welcome" };

/** Shown once, right after an account is confirmed. Nothing here is required: every step can be skipped. */
export default async function WelcomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/sign-in");

  const userId = typeof data.claims.sub === "string" ? data.claims.sub : null;
  let name: string | null = null;
  if (userId) {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
    name = typeof profile?.display_name === "string" && profile.display_name.trim() ? profile.display_name.trim() : null;
  }

  return (
    <main className="auth welcome">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <span className="logo">
          <span className="logo-mark">
            <LogoMark />
          </span>
          Tailr
        </span>
        <div className="stack">
          <h1>{name ? `Welcome, ${name}` : "Welcome to Tailr"}</h1>
          <p className="muted">Your account is ready. Here is how to get going. Every step is optional, and you can come back to any of them.</p>
        </div>

        {name ? null : <WelcomeName />}

        <ol className="steps">
          <li>
            <span className="step-n">1</span>
            <div>
              <strong>Record a bet you placed</strong>
              <p className="muted">Stake, odds and bookmaker, then settle it when it finishes. Profit and ROI are worked out for you.</p>
              <Link href="/bets/new" className="link-more">
                Add a bet
              </Link>
            </div>
          </li>
          <li>
            <span className="step-n">2</span>
            <div>
              <strong>Build or adapt a slip</strong>
              <p className="muted">Paste a slip from a chat, check what Tailr read, and tidy it up. A slip is a draft, never a placed bet.</p>
              <Link href="/create" className="link-more">
                Open Create
              </Link>
            </div>
          </li>
          <li>
            <span className="step-n">3</span>
            <div>
              <strong>Set your preferences</strong>
              <p className="muted">Favourite sports, markets to avoid, a target odds range. Optional, and only used to point things out on your slips.</p>
              <Link href="/profile/preferences" className="link-more">
                Set preferences
              </Link>
            </div>
          </li>
        </ol>

        <InstallPrompt />

        <p className="muted" style={{ fontSize: 13 }}>
          Tailr keeps a record of what you tell it. It does not connect to your bookmaker, place bets, or check results, so everything is user-reported.
        </p>
        <Link href="/dashboard" className="btn btn-primary btn-block">
          Go to my dashboard
        </Link>
      </div>
    </main>
  );
}
