import Link from "next/link";
import { LogoMark } from "@/components/icons";
import { betaCodeFromEnv } from "@/lib/auth/beta";
import { SignUpForm } from "../forms";

export const metadata = { title: "Create account" };
// Read on every visit, so turning the invite code on or off needs no new build.
export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <main className="auth">
      <div className="auth-card">
        <Link href="/" className="logo" aria-label="Tailr home">
          <span className="logo-mark">
            <LogoMark />
          </span>
          Tailr
        </Link>
        <div className="stack">
          <h1>Create your account</h1>
          <p className="muted">Free while we are in testing. Your bets stay private to you.</p>
        </div>
        <SignUpForm inviteRequired={betaCodeFromEnv() !== null} />
        <p className="auth-foot">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
