import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/icons";

export const metadata: Metadata = { title: "How Tailr handles your data" };

export default function PrivacyPage() {
  return (
    <main className="auth" style={{ alignItems: "flex-start" }}>
      <div className="auth-card stack" style={{ maxWidth: 640 }}>
        <Link href="/" className="logo" aria-label="Tailr">
          <span className="logo-mark">
            <LogoMark />
          </span>
          Tailr
        </Link>
        <h1>How Tailr handles your data</h1>
        <p className="muted">This is a private beta. This page says plainly what the app does today. It is not a legal contract.</p>

        <h2 className="section-title">What we keep</h2>
        <ul className="stack">
          <li>Your email, your name, and your password (stored only as a one-way hash by our sign-in provider, Supabase).</li>
          <li>The bets you record, the slip drafts you build, and your preferences.</li>
          <li>If you connect Telegram: your Telegram account number and chat number. Slips you send the bot are saved as drafts in your account.</li>
          <li>A log of each AI read: when, how long, and how much text. It does not keep the text or the image.</li>
          <li>Notes you send from the Profile tab.</li>
        </ul>

        <h2 className="section-title">Who can see it</h2>
        <p>Only you can see your bets and slips in the app. The Tailr team can see data in the database when we run it, and we only look at your records to fix a problem you tell us about. We do not sell your data.</p>

        <h2 className="section-title">Outside services</h2>
        <ul className="stack">
          <li>Supabase stores the database and handles sign-in.</li>
          <li>Vercel hosts the app.</li>
          <li>When you ask Tailr to read a screenshot, the image is sent to Anthropic, which makes the AI model that copies out the text. Slip text is only sent there when AI reading is switched on.</li>
          <li>Telegram carries the messages you send the bot.</li>
        </ul>

        <h2 className="section-title">What Tailr is not</h2>
        <p>Tailr does not place bets, hold money, or tell you what will win. You place bets yourself with a licensed bookmaker. Betting can lose money. Only stake what you can afford to lose. If gambling is causing you harm, talk to someone you trust or a local support service.</p>

        <h2 className="section-title">Your controls</h2>
        <ul className="stack">
          <li>Export every bet as CSV or JSON from the Profile tab.</li>
          <li>Disconnect Telegram from the Profile tab.</li>
          <li>Delete your account from the Profile tab. This removes your account and everything in it.</li>
        </ul>

        <p className="auth-foot">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
