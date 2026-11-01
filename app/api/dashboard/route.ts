import { getDeps } from "@/lib/api/context";
import { handleDashboard } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleDashboard(await getDeps(), request);
}
