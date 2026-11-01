import Link from "next/link";
import { AuthForm } from "../auth-form";
import { signUp } from "../actions";

export default function SignUpPage() {
  return (
    <main>
      <h1>Create your account</h1>
      <AuthForm action={signUp} submitLabel="Create account" passwordAutoComplete="new-password" />
      <p>
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
