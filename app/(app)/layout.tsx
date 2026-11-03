import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav, SideNav } from "@/components/nav";
import { UserProvider, type CurrentUser } from "@/components/user-context";
import { createClient } from "@/lib/supabase/server";

// Protected area. Every signed-in screen lives under app/(app)/.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/sign-in");

  const email = String(data.claims.email ?? "");
  const userId = typeof data.claims.sub === "string" ? data.claims.sub : null;

  // Read-only: the signed-in user can only ever see their own profile row (row-level security).
  let displayName: string | null = null;
  if (userId) {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
    displayName = typeof profile?.display_name === "string" && profile.display_name.trim() ? profile.display_name.trim() : null;
  }

  const user: CurrentUser = {
    name: displayName ?? (email.split("@")[0] || "there"),
    email,
    hasDisplayName: displayName !== null,
  };

  return (
    <UserProvider user={user}>
      <div className="shell">
        <SideNav />
        <main className="main">{children}</main>
        <BottomNav />
      </div>
    </UserProvider>
  );
}
