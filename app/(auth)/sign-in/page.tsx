import Link from "next/link";
import { AuthForm } from "../auth-form";
import { signIn } from "../actions";
import { safeNext } from "@/lib/api/safe-next";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main>
      <h1>Sign in</h1>
      {error === "link" ? <p role="alert">That confirmation link is invalid or has expired. Sign in, or sign up again.</p> : null}
      <AuthForm action={signIn} submitLabel="Sign in" passwordAutoComplete="current-password" next={next ? safeNext(next) : undefined} />
      <p>
        No account? <Link href="/sign-up">Create one</Link>
      </p>
    </main>
  );
}
