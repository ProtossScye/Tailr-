import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "Tailr: track your bets, build better slips" },
  description: "Tailr is a bet tracker and slip assistant. Record the bets you place, settle them, and see profit, ROI and win rate worked out the same way every time.",
};

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/dashboard");

  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="logo">
          <span className="logo-mark">
            <LogoMark />
          </span>
          Tailr
        </span>
        <nav aria-label="Account" className="landing-bar-links">
          <Link href="/sign-in" className="btn btn-small">
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">Bet tracker and slip assistant</p>
          <h1 id="hero-title">
            Know where your bets <em>really</em> stand.
          </h1>
          <p className="lede">
            Record the bets you place, settle them when they finish, and see profit, ROI and win rate worked out the same way every time. Wins and losses
            get equal space, because the full picture is the point.
          </p>
          <div className="hero-cta">
            <Link href="/sign-up" className="btn btn-primary">
              Create free account
            </Link>
            <Link href="/sign-in" className="btn">
              Sign in
            </Link>
          </div>
          <p className="fine">Free while we are in testing. For adults only (18+).</p>
        </section>

        <section className="band" aria-labelledby="maths-title">
          <div className="band-inner">
            <h2 id="maths-title">How Tailr counts</h2>
            <p className="muted">Three settled bets, worked out the way Tailr always does it. This is a worked example, not a real account.</p>
            <table className="ledger">
              <caption className="sr-only">Worked example of profit and ROI</caption>
              <thead>
                <tr>
                  <th scope="col">Bet</th>
                  <th scope="col" className="r">
                    Stake
                  </th>
                  <th scope="col" className="r">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Won, paid out ₦9,000</td>
                  <td className="r num">₦5,000</td>
                  <td className="r num gain">+₦4,000</td>
                </tr>
                <tr>
                  <td>Lost</td>
                  <td className="r num">₦3,000</td>
                  <td className="r num loss">−₦3,000</td>
                </tr>
                <tr>
                  <td>Lost</td>
                  <td className="r num">₦2,000</td>
                  <td className="r num loss">−₦2,000</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="r num">₦10,000</td>
                  <td className="r num loss">−₦1,000</td>
                </tr>
                <tr>
                  <th scope="row">ROI</th>
                  <td />
                  <td className="r num loss">−10%</td>
                </tr>
              </tfoot>
            </table>
            <p className="muted">ROI is profit divided by the stakes of settled bets. Pending bets stay out until they settle.</p>
          </div>
        </section>

        <section className="section-wide" aria-labelledby="do-title">
          <h2 id="do-title">What you can do</h2>
          <ul className="cards">
            <li>
              <h3>Track every bet</h3>
              <p>Add stake, odds, bookmaker and selections. Settle as won, lost or void. Edit or delete anything. Export your history any time.</p>
            </li>
            <li>
              <h3>Adapt a slip</h3>
              <p>Paste a slip from a chat. Tailr reads only what the text says, shows what it is unsure about, and suggests selections you might take out.</p>
            </li>
            <li>
              <h3>See the real numbers</h3>
              <p>Profit, ROI, win rate and a history you can filter. By bookmaker, by sport, by month. Naira and dollars are never added together.</p>
            </li>
          </ul>
        </section>

        <section className="section-wide" aria-labelledby="how-title">
          <h2 id="how-title">How it works</h2>
          <ol className="steps">
            <li>
              <span className="step-n">1</span>
              <div>
                <strong>Create your account</strong>
                <p className="muted">Your email, a password, and a 6-digit code we send to confirm it is yours.</p>
              </div>
            </li>
            <li>
              <span className="step-n">2</span>
              <div>
                <strong>Add the bets you place</strong>
                <p className="muted">After you place a bet with your bookmaker, record it here. Settle it when the result is in.</p>
              </div>
            </li>
            <li>
              <span className="step-n">3</span>
              <div>
                <strong>Check your numbers</strong>
                <p className="muted">Open Analytics for profit, ROI and win rate. Tailr never hides a losing stretch.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="band" aria-labelledby="honest-title">
          <div className="band-inner">
            <h2 id="honest-title">What Tailr is not</h2>
            <ul className="plain">
              <li>It does not place bets, hold your money or ask for your bookmaker login.</li>
              <li>It does not connect to bookmakers or show live odds. Everything is what you enter, labelled as user-reported.</li>
              <li>It does not promise wins. A slip is a draft, lower combined odds do not guarantee anything, and booking codes can only be checked with your bookmaker.</li>
            </ul>
          </div>
        </section>

        <section className="section-wide closing" aria-labelledby="cta-title">
          <h2 id="cta-title">Start with your next bet.</h2>
          <div className="hero-cta">
            <Link href="/sign-up" className="btn btn-primary">
              Create free account
            </Link>
            <Link href="/sign-in" className="btn">
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-foot">
        <p>Betting is for adults aged 18 and over. Only stake what you can afford to lose. If gambling is causing you harm, take a break and talk to someone you trust.</p>
        <p>© Tailr</p>
      </footer>
    </div>
  );
}
