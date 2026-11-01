import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";

// Protected area. Every signed-in screen lives under app/(app)/.
// The co-founder builds the real shell (navigation, responsive layout) here.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/sign-in");

  return (
    <div>
      <header>
        <strong>Tailr</strong> · signed in as {String(data.claims.email ?? "you")}
        <form action="/auth/sign-out" method="post" style={{ display: "inline", marginLeft: 12 }}>
          <button type="submit">Sign out</button>
        </form>
      </header>
      {children}
    </div>
  );
}
