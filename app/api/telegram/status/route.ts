import { getTelegramLinkDeps } from "@/lib/api/context";
import { handleTelegramStatus } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleTelegramStatus(await getTelegramLinkDeps());
}
