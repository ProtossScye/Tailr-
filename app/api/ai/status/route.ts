import { getAiDeps } from "@/lib/api/context";
import { handleAiStatus } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleAiStatus(await getAiDeps());
}
