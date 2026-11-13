import Link from "next/link";
import { SignInForm } from "../forms";
import { safeNext } from "@/lib/api/safe-next";
import { LogoMark } from "@/components/icons";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const { next, error, deleted } = await searchParams;
  return (
    <main className="auth">
      <div className="auth-card">
        <Link href="/" className="logo" aria-label="Tailr">
          <span className="logo-mark">
            <LogoMark />
          </span>
          Tailr
        </Link>
        <h1>Welcome back</h1>
        {error === "link" ? (
          <p className="banner banner-error" role="alert">
            That confirmation link is invalid or has expired. Sign in, or sign up again.
          </p>
        ) : null}
        {deleted === "1" ? (
          <p className="banner banner-note" role="status">
            Your account and everything in it has been deleted.
          </p>
        ) : null}
        <SignInForm next={next ? safeNext(next) : undefined} />
        <p className="auth-foot">
          No account? <Link href="/sign-up">Create one</Link>
        </p>
      </div>
    </main>
  );
}
