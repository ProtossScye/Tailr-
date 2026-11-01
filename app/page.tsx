import Link from "next/link";

// Placeholder landing page. The co-founder replaces this.
export default function Home() {
  return (
    <main>
      <h1>Tailr</h1>
      <p>Track your bets and see how you are really doing.</p>
      <p>
        <Link href="/sign-in">Sign in</Link> · <Link href="/sign-up">Create account</Link>
      </p>
    </main>
  );
}
