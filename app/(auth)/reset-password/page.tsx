import Link from "next/link";
import { LogoMark } from "@/components/icons";
import { ResetForm } from "../forms";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string; sent?: string }> }) {
  const { email, sent } = await searchParams;
  const shown = typeof email === "string" ? email.slice(0, 254) : "";
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
          <h1>Choose a new password</h1>
          <p className="muted">
            {sent ? "If that email has an account, we have sent it a 6-digit code. " : ""}Enter the code and your new password.
          </p>
        </div>
        <ResetForm email={shown} />
        <p className="auth-foot">
          No code? <Link href="/forgot-password">Send another</Link>
        </p>
      </div>
    </main>
  );
}
