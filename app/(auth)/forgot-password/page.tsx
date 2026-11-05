import Link from "next/link";
import { LogoMark } from "@/components/icons";
import { ForgotForm } from "../forms";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
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
          <h1>Forgot your password?</h1>
          <p className="muted">Enter your email and we will send you a 6-digit code to choose a new one.</p>
        </div>
        <ForgotForm />
        <p className="auth-foot">
          Remembered it? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
