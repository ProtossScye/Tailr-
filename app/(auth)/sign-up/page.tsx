import Link from "next/link";
import { LogoMark } from "@/components/icons";
import { SignUpForm } from "../forms";

export const metadata = { title: "Create account" };

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
        <SignUpForm />
        <p className="auth-foot">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
