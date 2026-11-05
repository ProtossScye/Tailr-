import Link from "next/link";
import { LogoMark } from "@/components/icons";
import { VerifyForm } from "../forms";

export const metadata = { title: "Confirm your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
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
          <h1>Check your email</h1>
          <p className="muted">
            {shown ? (
              <>
                We sent a 6-digit code to <strong>{shown}</strong>. Enter it below to finish creating your account.
              </>
            ) : (
              "Enter the 6-digit code we emailed you to finish creating your account."
            )}
          </p>
        </div>
        <VerifyForm email={shown} />
        <p className="auth-foot">
          Wrong email? <Link href="/sign-up">Start again</Link>
        </p>
      </div>
    </main>
  );
}
