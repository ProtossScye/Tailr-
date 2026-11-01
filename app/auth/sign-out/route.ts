import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST only, so a stray link or image cannot sign someone out. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const target = request.nextUrl.clone();
  target.pathname = "/sign-in";
  target.search = "";
  return NextResponse.redirect(target, { status: 303 });
}
