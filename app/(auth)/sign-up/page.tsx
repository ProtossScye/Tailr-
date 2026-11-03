import Link from "next/link";
import { AuthForm } from "../auth-form";
import { signUp } from "../actions";
import { LogoMark } from "@/components/icons";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <main className="auth">
      <div className="auth-card">
        <Link href="/" className="logo" aria-label="Tailr">
          <span className="logo-mark">
            <LogoMark />
          </span>
          Tailr
        </Link>
        <h1>Create your account</h1>
        <AuthForm action={signUp} submitLabel="Create account" passwordAutoComplete="new-password" />
        <p className="auth-foot">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
